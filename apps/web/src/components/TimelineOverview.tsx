import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTime, type CompletedSegment, type EditorState } from '../editor';

type Props = {
  editor: EditorState;
  dragPreview: CompletedSegment | null;
  currentTimeMs: number;
  onSelectSegment: (lineId: string) => void;
  onPreviewSegmentDrag: (lineId: string, startMs: number, endMs: number) => void;
  onCommitSegmentDrag: (lineId: string, startMs: number, endMs: number) => void;
  onCancelSegmentDrag: () => void;
};

type WaveformState = {
  peaks: number[];
  error: string | null;
};

type WindowPreset = 15 | 30 | 60 | 'full';

const FULL_PEAK_COUNT = 720;
const VISIBLE_PEAK_COUNT = 120;
const WINDOW_PRESETS: WindowPreset[] = [15, 30, 60, 'full'];

function useWaveformPeaks(audioUrl: string | null): WaveformState {
  const [state, setState] = useState<WaveformState>({ peaks: [], error: null });

  useEffect(() => {
    if (!audioUrl) {
      setState({ peaks: [], error: null });
      return;
    }

    let live = true;
    let context: AudioContext | null = null;

    const load = async () => {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error('Waveform preview could not load this audio source.');
        }

        const buffer = await response.arrayBuffer();
        if (!live) return;

        context = new AudioContext();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        if (!live) return;

        const channelData = decoded.getChannelData(0);
        const peaks = buildPeaks(channelData, FULL_PEAK_COUNT);
        setState({ peaks, error: null });
      } catch {
        if (!live) return;
        setState({
          peaks: [],
          error: 'Waveform preview unavailable for this audio source.',
        });
      } finally {
        if (context) void context.close();
      }
    };

    void load();

    return () => {
      live = false;
      if (context) void context.close();
    };
  }, [audioUrl]);

  return state;
}

function buildPeaks(samples: Float32Array, peakCount: number): number[] {
  if (samples.length === 0) return [];

  const bucketSize = Math.max(1, Math.floor(samples.length / peakCount));
  const peaks: number[] = [];

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
    const start = peakIndex * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);

    let max = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      max = Math.max(max, Math.abs(samples[sampleIndex] ?? 0));
    }

    peaks.push(Math.max(0.04, max));
  }

  return peaks;
}

function getCenteredWindow(
  durationMs: number,
  centerMs: number,
  requestedWindowMs: number,
) {
  const windowMs = Math.min(requestedWindowMs, durationMs);
  const halfWindowMs = windowMs / 2;

  let startMs = Math.max(0, centerMs - halfWindowMs);
  let endMs = Math.min(durationMs, startMs + windowMs);

  if (endMs - startMs < windowMs) {
    startMs = Math.max(0, endMs - windowMs);
  }

  return { startMs, endMs, windowMs: Math.max(1, endMs - startMs) };
}

function getWindowFromStart(
  durationMs: number,
  requestedWindowMs: number,
  startMs: number,
) {
  const windowMs = Math.min(requestedWindowMs, durationMs);
  const clampedStartMs = Math.min(Math.max(0, startMs), Math.max(0, durationMs - windowMs));
  const endMs = Math.min(durationMs, clampedStartMs + windowMs);

  return {
    startMs: clampedStartMs,
    endMs,
    windowMs: Math.max(1, endMs - clampedStartMs),
  };
}

function buildRulerTicks(windowStartMs: number, windowEndMs: number): number[] {
  const stepMs = 5_000;
  const firstTickMs = Math.ceil(windowStartMs / stepMs) * stepMs;
  const ticks = [windowStartMs];

  for (let tickMs = firstTickMs; tickMs < windowEndMs; tickMs += stepMs) {
    if (tickMs > windowStartMs) ticks.push(tickMs);
  }

  ticks.push(windowEndMs);
  return Array.from(new Set(ticks));
}

function toWindowPercent(valueMs: number, windowStartMs: number, windowDurationMs: number) {
  return ((valueMs - windowStartMs) / windowDurationMs) * 100;
}

function formatRulerLabel(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sampleVisiblePeaks(
  peaks: number[],
  durationMs: number,
  windowStartMs: number,
  windowEndMs: number,
): number[] {
  if (peaks.length === 0 || durationMs <= 0) return [];

  const visiblePeaks: number[] = [];

  for (let index = 0; index < VISIBLE_PEAK_COUNT; index += 1) {
    const bucketStartMs =
      windowStartMs + (index / VISIBLE_PEAK_COUNT) * (windowEndMs - windowStartMs);
    const bucketEndMs =
      windowStartMs +
      ((index + 1) / VISIBLE_PEAK_COUNT) * (windowEndMs - windowStartMs);
    const startPeakIndex = Math.floor((bucketStartMs / durationMs) * peaks.length);
    const endPeakIndex = Math.max(
      startPeakIndex + 1,
      Math.ceil((bucketEndMs / durationMs) * peaks.length),
    );

    let max = 0;
    for (let peakIndex = startPeakIndex; peakIndex < endPeakIndex; peakIndex += 1) {
      max = Math.max(max, peaks[peakIndex] ?? 0);
    }
    visiblePeaks.push(Math.max(0.04, max));
  }

  return visiblePeaks;
}

type DragState = {
  pointerId: number;
  lineId: string;
  startClientX: number;
  windowDurationMs: number;
  originalStartMs: number;
  durationMs: number;
  hasDragged: boolean;
};

const DRAG_START_THRESHOLD_PX = 3;

export function TimelineOverview({
  editor,
  dragPreview,
  currentTimeMs,
  onSelectSegment,
  onPreviewSegmentDrag,
  onCommitSegmentDrag,
  onCancelSegmentDrag,
}: Props) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const durationMs = editor.document.durationMs;
  const audioUrl = editor.document.source.audioUrl;
  const { peaks, error } = useWaveformPeaks(audioUrl);
  const [laneWidthPx, setLaneWidthPx] = useState(0);
  const [windowPreset, setWindowPreset] = useState<WindowPreset>(15);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [manualWindowStartMs, setManualWindowStartMs] = useState(0);
  const requestedWindowMs = windowPreset === 'full' ? durationMs : windowPreset * 1000;
  const centeredWindow = useMemo(
    () => getCenteredWindow(durationMs, currentTimeMs, requestedWindowMs),
    [currentTimeMs, durationMs, requestedWindowMs],
  );
  const manualWindow = useMemo(
    () => getWindowFromStart(durationMs, requestedWindowMs, manualWindowStartMs),
    [durationMs, manualWindowStartMs, requestedWindowMs],
  );
  const {
    startMs: visibleStartMs,
    endMs: visibleEndMs,
    windowMs: visibleWindowMs,
  } = followPlayhead ? centeredWindow : manualWindow;

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;

    const updateWidth = () => {
      setLaneWidthPx(lane.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(lane);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setWindowPreset(15);
    setFollowPlayhead(true);
    setManualWindowStartMs(0);
  }, [audioUrl]);

  useEffect(() => {
    if (followPlayhead) {
      setManualWindowStartMs(centeredWindow.startMs);
      return;
    }

    setManualWindowStartMs((current) =>
      getWindowFromStart(durationMs, requestedWindowMs, current).startMs,
    );
  }, [centeredWindow.startMs, durationMs, followPlayhead, requestedWindowMs]);

  const timedSegments = useMemo(
    () =>
      editor.document.lines
        .map((line) => {
          const segment = editor.segments[line.id];
          if (!segment) return null;
          return { line, segment };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null),
    [editor.document.lines, editor.segments],
  );

  const ticks = useMemo(
    () => buildRulerTicks(visibleStartMs, visibleEndMs),
    [visibleEndMs, visibleStartMs],
  );
  const visiblePeaks = useMemo(
    () => sampleVisiblePeaks(peaks, durationMs, visibleStartMs, visibleEndMs),
    [durationMs, peaks, visibleEndMs, visibleStartMs],
  );
  const visibleSegments = useMemo(
    () =>
      timedSegments
        .map(({ line, segment }) => {
          const previewSegment =
            dragPreview?.lineId === line.id ? dragPreview : segment;
          if (previewSegment.endMs <= visibleStartMs || previewSegment.startMs >= visibleEndMs) {
            return null;
          }

          const clippedStartMs = Math.max(previewSegment.startMs, visibleStartMs);
          const clippedEndMs = Math.min(previewSegment.endMs, visibleEndMs);
          const left = toWindowPercent(clippedStartMs, visibleStartMs, visibleWindowMs);
          const width =
            toWindowPercent(clippedEndMs, visibleStartMs, visibleWindowMs) - left;
          const widthPx = (Math.max(width, 0) / 100) * laneWidthPx;
          const labelMode =
            widthPx >= 36 ? 'lyric' : widthPx >= 20 ? 'index' : 'none';

          return {
            line,
            segment: previewSegment,
            left,
            width,
            labelMode,
            isSelected: line.id === editor.selectedLineId,
            isPlaying:
              segment.startMs <= currentTimeMs && currentTimeMs < segment.endMs,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null),
    [
      currentTimeMs,
      dragPreview,
      editor.selectedLineId,
      timedSegments,
      visibleEndMs,
      visibleStartMs,
      visibleWindowMs,
    ],
  );
  const playheadPercent = toWindowPercent(currentTimeMs, visibleStartMs, visibleWindowMs);
  const presetIndex = WINDOW_PRESETS.indexOf(windowPreset);
  const canZoomIn = presetIndex > 0;
  const canZoomOut = presetIndex < WINDOW_PRESETS.length - 1;
  const currentWindowLabel =
    windowPreset === 'full' ? 'Full track' : `${windowPreset} seconds`;
  const navigationMaxMs = Math.max(0, durationMs - Math.min(requestedWindowMs, durationMs));

  const updateDraggedSegment = (
    lineId: string,
    deltaClientX: number,
    dragState: DragState,
  ) => {
    const laneWidth = laneWidthPx || 1;
    const deltaMs = Math.round((deltaClientX / laneWidth) * dragState.windowDurationMs);
    const maxStartMs = Math.max(0, durationMs - dragState.durationMs);
    const startMs = Math.min(
      Math.max(0, dragState.originalStartMs + deltaMs),
      maxStartMs,
    );
    const endMs = startMs + dragState.durationMs;
    onPreviewSegmentDrag(lineId, startMs, endMs);
    return { startMs, endMs };
  };

  return (
    <section className="timeline-card" aria-labelledby="timeline-title">
      <div className="section-heading timeline-heading">
        <div>
          <p className="eyebrow">Timeline</p>
          <h2 id="timeline-title">Read-only alignment overview</h2>
          <p className="timeline-window-copy">
            Showing {formatTime(visibleStartMs)} to {formatTime(visibleEndMs)}
          </p>
        </div>
        <div className="timeline-header-actions">
          <span className="source-badge">Timed lines {timedSegments.length}</span>
          <div className="timeline-zoom-controls" aria-label="Timeline zoom">
            <button
              type="button"
              aria-label="Zoom in timeline"
              onClick={() => {
                if (!canZoomIn) return;
                setWindowPreset(WINDOW_PRESETS[presetIndex - 1] ?? 15);
              }}
              disabled={!canZoomIn}
            >
              -
            </button>
            <span className="timeline-window-value">{currentWindowLabel}</span>
            <button
              type="button"
              aria-label="Zoom out timeline"
              onClick={() => {
                if (!canZoomOut) return;
                setWindowPreset(WINDOW_PRESETS[presetIndex + 1] ?? 'full');
              }}
              disabled={!canZoomOut}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="timeline-ruler" aria-hidden="true">
        {ticks.map((tickMs) => {
          const left = toWindowPercent(tickMs, visibleStartMs, visibleWindowMs);
          return (
            <div key={tickMs} className="timeline-tick" style={{ left: `${left}%` }}>
              <span>{formatRulerLabel(tickMs)}</span>
            </div>
          );
        })}
      </div>

      <div className="timeline-surface">
        <div className="waveform-band" aria-label="Waveform preview">
          {visiblePeaks.length > 0 ? (
            visiblePeaks.map((peak, index) => (
              <span
                key={`${index}-${peak}`}
                className="waveform-bar"
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            ))
          ) : (
            <p className="timeline-note">
              {error ?? 'Loading waveform preview from the current audio source…'}
            </p>
          )}
        </div>

        <div ref={laneRef} className="segment-lane" aria-label="Timed lyric segments">
          {visibleSegments.length > 0 ? (
            visibleSegments.map(({ line, segment, left, width, labelMode, isSelected, isPlaying }) => {
              return (
                <button
                  type="button"
                  key={line.id}
                  className="timeline-segment"
                  data-selected={isSelected || undefined}
                  data-playing={isPlaying || undefined}
                  data-dragging={dragStateRef.current?.lineId === line.id || undefined}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0)}%`,
                  }}
                  title={`${line.text}\n${formatTime(segment.startMs)} - ${formatTime(segment.endMs)}`}
                  aria-label={`${line.text} from ${formatTime(segment.startMs)} to ${formatTime(segment.endMs)}`}
                  onClick={() => onSelectSegment(line.id)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;

                    dragStateRef.current = {
                      pointerId: event.pointerId,
                      lineId: line.id,
                      startClientX: event.clientX,
                      windowDurationMs: visibleWindowMs,
                      originalStartMs: segment.startMs,
                      durationMs: segment.endMs - segment.startMs,
                      hasDragged: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const dragState = dragStateRef.current;
                    if (
                      !dragState ||
                      dragState.pointerId !== event.pointerId ||
                      dragState.lineId !== line.id
                    ) {
                      return;
                    }

                    const deltaClientX = event.clientX - dragState.startClientX;
                    if (!dragState.hasDragged) {
                      if (Math.abs(deltaClientX) < DRAG_START_THRESHOLD_PX) return;
                      dragState.hasDragged = true;
                      setFollowPlayhead(false);
                      setManualWindowStartMs(visibleStartMs);
                      onSelectSegment(line.id);
                      onPreviewSegmentDrag(line.id, segment.startMs, segment.endMs);
                    }

                    updateDraggedSegment(
                      line.id,
                      deltaClientX,
                      dragState,
                    );
                  }}
                  onPointerUp={(event) => {
                    const dragState = dragStateRef.current;
                    if (
                      !dragState ||
                      dragState.pointerId !== event.pointerId ||
                      dragState.lineId !== line.id
                    ) {
                      return;
                    }

                    if (!dragState.hasDragged) {
                      dragStateRef.current = null;
                      event.currentTarget.releasePointerCapture(event.pointerId);
                      return;
                    }

                    const nextSegment = updateDraggedSegment(
                      line.id,
                      event.clientX - dragState.startClientX,
                      dragState,
                    );
                    dragStateRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    onCommitSegmentDrag(line.id, nextSegment.startMs, nextSegment.endMs);
                  }}
                  onPointerCancel={(event) => {
                    const dragState = dragStateRef.current;
                    if (
                      !dragState ||
                      dragState.pointerId !== event.pointerId ||
                      dragState.lineId !== line.id
                    ) {
                      return;
                    }

                    dragStateRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    if (dragState.hasDragged) onCancelSegmentDrag();
                  }}
                >
                  {labelMode === 'lyric' ? (
                    <>
                      <span className="timeline-segment-label">{line.text}</span>
                    </>
                  ) : null}
                  {labelMode === 'index' ? (
                    <span className="timeline-segment-index">{line.index + 1}</span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="timeline-note">
              {timedSegments.length > 0
                ? `No timed segments are visible in this ${currentWindowLabel.toLowerCase()} window.`
                : 'Timed segments will appear here as you capture or load alignment data.'}
            </p>
          )}
        </div>

        <div
          className="timeline-playhead"
          style={{ left: `${Math.min(Math.max(playheadPercent, 0), 100)}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="timeline-navigation">
        <label className="timeline-navigation-label">
          <span>Viewport position</span>
          <input
            type="range"
            min={0}
            max={navigationMaxMs}
            step={1}
            value={followPlayhead ? centeredWindow.startMs : manualWindow.startMs}
            onChange={(event) => {
              setFollowPlayhead(false);
              setManualWindowStartMs(Number(event.target.value));
            }}
            disabled={navigationMaxMs === 0}
          />
        </label>
        {!followPlayhead ? (
          <button
            type="button"
            className="timeline-return-button"
            onClick={() => {
              setFollowPlayhead(true);
              setManualWindowStartMs(centeredWindow.startMs);
            }}
          >
            Return to playhead
          </button>
        ) : null}
      </div>
    </section>
  );
}
