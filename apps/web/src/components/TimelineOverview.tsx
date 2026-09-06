import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTime, type CompletedSegment, type EditorState } from '../editor';

type Props = {
  editor: EditorState;
  dragPreviewSegments: CompletedSegment[] | null;
  linePlacementPreview: {
    lineId: string;
    text: string;
    clientX: number;
    clientY: number;
    segment: CompletedSegment | null;
  } | null;
  currentTimeMs: number;
  onSelectSegment: (lineId: string) => void;
  onPreviewSegmentDrag: (segments: CompletedSegment[]) => void;
  onCommitSegmentDrag: (segments: CompletedSegment[]) => void;
  onCancelSegmentDrag: () => void;
  onTimelineLaneMetricsChange: (metrics: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    visibleStartMs: number;
    visibleWindowMs: number;
    durationMs: number;
  }) => void;
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
  mode: 'move' | 'resize-left' | 'resize-right';
  pointerId: number;
  lineId: string;
  selectedLineIds: string[];
  startClientX: number;
  windowDurationMs: number;
  originalStartMs: number;
  originalEndMs: number;
  hasDragged: boolean;
};

const DRAG_START_THRESHOLD_PX = 3;

export function TimelineOverview({
  editor,
  dragPreviewSegments,
  linePlacementPreview,
  currentTimeMs,
  onSelectSegment,
  onPreviewSegmentDrag,
  onCommitSegmentDrag,
  onCancelSegmentDrag,
  onTimelineLaneMetricsChange,
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
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
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
    const initiallySelectedLineId =
      editor.selectedLineId && editor.segments[editor.selectedLineId] ? editor.selectedLineId : null;
    setSelectedLineIds(initiallySelectedLineId ? [initiallySelectedLineId] : []);
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
  const selectedLineIdSet = useMemo(() => new Set(selectedLineIds), [selectedLineIds]);
  const primarySelectedLineId = selectedLineIds.at(-1) ?? null;

  useEffect(() => {
    if (!editor.selectedLineId || !editor.segments[editor.selectedLineId]) return;
    if (selectedLineIdSet.has(editor.selectedLineId)) return;
    setSelectedLineIds([editor.selectedLineId]);
  }, [editor.selectedLineId, editor.segments, selectedLineIdSet]);

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
            dragPreviewSegments?.find((preview) => preview.lineId === line.id) ?? segment;
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
            isSelected: selectedLineIdSet.has(line.id),
            isPrimarySelected: primarySelectedLineId === line.id,
            isPlaying:
              segment.startMs <= currentTimeMs && currentTimeMs < segment.endMs,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null),
    [
      currentTimeMs,
      dragPreviewSegments,
      primarySelectedLineId,
      selectedLineIdSet,
      timedSegments,
      visibleEndMs,
      visibleStartMs,
      visibleWindowMs,
    ],
  );
  const playheadPercent = toWindowPercent(currentTimeMs, visibleStartMs, visibleWindowMs);
  const placementPreviewPercent =
    linePlacementPreview?.segment != null
      ? toWindowPercent(
          linePlacementPreview.segment.startMs,
          visibleStartMs,
          visibleWindowMs,
        )
      : null;
  const placementPreviewWidthPercent =
    linePlacementPreview?.segment != null
      ? toWindowPercent(
          linePlacementPreview.segment.endMs,
          visibleStartMs,
          visibleWindowMs,
        ) - toWindowPercent(linePlacementPreview.segment.startMs, visibleStartMs, visibleWindowMs)
      : null;
  const presetIndex = WINDOW_PRESETS.indexOf(windowPreset);
  const canZoomIn = presetIndex > 0;
  const canZoomOut = presetIndex < WINDOW_PRESETS.length - 1;
  const currentWindowLabel =
    windowPreset === 'full' ? 'Full track' : `${windowPreset} seconds`;
  const navigationMaxMs = Math.max(0, durationMs - Math.min(requestedWindowMs, durationMs));

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;

    const publishMetrics = () => {
      const rect = lane.getBoundingClientRect();
      onTimelineLaneMetricsChange({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        visibleStartMs,
        visibleWindowMs,
        durationMs,
      });
    };

    publishMetrics();
    window.addEventListener('scroll', publishMetrics, true);
    window.addEventListener('resize', publishMetrics);

    return () => {
      window.removeEventListener('scroll', publishMetrics, true);
      window.removeEventListener('resize', publishMetrics);
    };
  }, [durationMs, onTimelineLaneMetricsChange, visibleStartMs, visibleWindowMs]);

  const getDraggedSegment = (deltaClientX: number, dragState: DragState) => {
    const laneWidth = laneWidthPx || 1;
    const deltaMs = Math.round((deltaClientX / laneWidth) * dragState.windowDurationMs);

    if (dragState.mode === 'move') {
      const segmentDurationMs = dragState.originalEndMs - dragState.originalStartMs;
      const maxStartMs = Math.max(0, durationMs - segmentDurationMs);
      const startMs = Math.min(
        Math.max(0, dragState.originalStartMs + deltaMs),
        maxStartMs,
      );
      return { startMs, endMs: startMs + segmentDurationMs };
    }

    if (dragState.mode === 'resize-left') {
      const startMs = Math.min(
        Math.max(0, dragState.originalStartMs + deltaMs),
        dragState.originalEndMs - 1,
      );
      return { startMs, endMs: dragState.originalEndMs };
    }

    const endMs = Math.max(
      Math.min(durationMs, dragState.originalEndMs + deltaMs),
      dragState.originalStartMs + 1,
    );
    return { startMs: dragState.originalStartMs, endMs };
  };

  const updateDraggedSegments = (deltaClientX: number, dragState: DragState) => {
    const selectedGroupLineIds =
      dragState.mode === 'move' && dragState.selectedLineIds.includes(dragState.lineId)
        ? dragState.selectedLineIds
        : [dragState.lineId];

    const baseSegments = selectedGroupLineIds
      .map((lineId) => editor.segments[lineId])
      .filter((segment): segment is CompletedSegment => segment != null);

    if (dragState.mode !== 'move') {
      const nextSegment = getDraggedSegment(deltaClientX, dragState);
      const previewSegments = [{ lineId: dragState.lineId, ...nextSegment }];
      onPreviewSegmentDrag(previewSegments);
      return previewSegments;
    }

    const laneWidth = laneWidthPx || 1;
    const rawDeltaMs = Math.round((deltaClientX / laneWidth) * dragState.windowDurationMs);
    const earliestStartMs = Math.min(...baseSegments.map((segment) => segment.startMs));
    const latestEndMs = Math.max(...baseSegments.map((segment) => segment.endMs));
    const clampedDeltaMs = Math.min(
      Math.max(rawDeltaMs, -earliestStartMs),
      durationMs - latestEndMs,
    );

    const previewSegments = baseSegments.map((segment) => ({
      lineId: segment.lineId,
      startMs: segment.startMs + clampedDeltaMs,
      endMs: segment.endMs + clampedDeltaMs,
    }));

    onPreviewSegmentDrag(previewSegments);
    return previewSegments;
  };

  const selectOnlySegment = (lineId: string) => {
    setSelectedLineIds([lineId]);
    onSelectSegment(lineId);
  };

  const toggleSegmentSelection = (lineId: string) => {
    setSelectedLineIds((current) => {
      if (current.includes(lineId)) {
        if (current.length === 1) {
          onSelectSegment(lineId);
          return current;
        }

        const next = current.filter((id) => id !== lineId);
        const nextPrimary = next.at(-1);
        if (nextPrimary) onSelectSegment(nextPrimary);
        return next;
      }

      const next = [...current, lineId];
      onSelectSegment(lineId);
      return next;
    });
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
          {linePlacementPreview?.segment && placementPreviewPercent != null && placementPreviewWidthPercent != null ? (
            <>
              <div
                className="timeline-placement-guide"
                style={{ left: `${Math.min(Math.max(placementPreviewPercent, 0), 100)}%` }}
                aria-hidden="true"
              />
              <div
                className="timeline-placement-preview"
                style={{
                  left: `${placementPreviewPercent}%`,
                  width: `${Math.max(placementPreviewWidthPercent, 0.2)}%`,
                }}
                title={`${linePlacementPreview.text}\n${formatTime(linePlacementPreview.segment.startMs)} - ${formatTime(linePlacementPreview.segment.endMs)}`}
              >
                <span>{linePlacementPreview.text}</span>
              </div>
            </>
          ) : null}
          {visibleSegments.length > 0 ? (
            visibleSegments.map(
              ({ line, segment, left, width, labelMode, isSelected, isPrimarySelected, isPlaying }) => {
                const canShowSingleSelectionManipulators = selectedLineIds.length <= 1 || isPrimarySelected;

              return (
                <button
                  type="button"
                  key={line.id}
                  className="timeline-segment"
                  data-selected={isSelected || undefined}
                  data-primary-selected={isPrimarySelected || undefined}
                  data-playing={isPlaying || undefined}
                  data-dragging={dragStateRef.current?.lineId === line.id || undefined}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0)}%`,
                  }}
                  title={`${line.text}\n${formatTime(segment.startMs)} - ${formatTime(segment.endMs)}`}
                  aria-label={`${line.text} from ${formatTime(segment.startMs)} to ${formatTime(segment.endMs)}`}
                  onClick={(event) => {
                    if (event.shiftKey) {
                      toggleSegmentSelection(line.id);
                      return;
                    }
                    selectOnlySegment(line.id);
                  }}
                  onPointerDown={(event) => {
                    if (event.shiftKey) return;
                    if (event.button !== 0) return;

                    dragStateRef.current = {
                      mode: 'move',
                      pointerId: event.pointerId,
                      lineId: line.id,
                      selectedLineIds: selectedLineIdSet.has(line.id)
                        ? selectedLineIds
                        : [line.id],
                      startClientX: event.clientX,
                      windowDurationMs: visibleWindowMs,
                      originalStartMs: segment.startMs,
                      originalEndMs: segment.endMs,
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
                      if (!dragState.selectedLineIds.includes(line.id)) {
                        selectOnlySegment(line.id);
                      }
                      onPreviewSegmentDrag([
                        { lineId: line.id, startMs: segment.startMs, endMs: segment.endMs },
                      ]);
                    }

                    updateDraggedSegments(
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

                    const nextSegments = updateDraggedSegments(
                      event.clientX - dragState.startClientX,
                      dragState,
                    );
                    dragStateRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    onCommitSegmentDrag(nextSegments);
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
                  {canShowSingleSelectionManipulators ? (
                    <span
                      className="timeline-segment-handle timeline-segment-handle-left"
                      aria-hidden="true"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        dragStateRef.current = {
                          mode: 'resize-left',
                          pointerId: event.pointerId,
                          lineId: line.id,
                          selectedLineIds: [line.id],
                          startClientX: event.clientX,
                          windowDurationMs: visibleWindowMs,
                          originalStartMs: segment.startMs,
                          originalEndMs: segment.endMs,
                          hasDragged: true,
                        };
                        setFollowPlayhead(false);
                        setManualWindowStartMs(visibleStartMs);
                        selectOnlySegment(line.id);
                        onPreviewSegmentDrag([
                          { lineId: line.id, startMs: segment.startMs, endMs: segment.endMs },
                        ]);
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const dragState = dragStateRef.current;
                        if (
                          !dragState ||
                          dragState.mode !== 'resize-left' ||
                          dragState.pointerId !== event.pointerId ||
                          dragState.lineId !== line.id
                        ) {
                          return;
                        }

                        updateDraggedSegments(
                          event.clientX - dragState.startClientX,
                          dragState,
                        );
                      }}
                      onPointerUp={(event) => {
                        const dragState = dragStateRef.current;
                        if (
                          !dragState ||
                          dragState.mode !== 'resize-left' ||
                          dragState.pointerId !== event.pointerId ||
                          dragState.lineId !== line.id
                        ) {
                          return;
                        }

                        const nextSegments = updateDraggedSegments(
                          event.clientX - dragState.startClientX,
                          dragState,
                        );
                        dragStateRef.current = null;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        onCommitSegmentDrag(nextSegments);
                      }}
                      onPointerCancel={(event) => {
                        const dragState = dragStateRef.current;
                        if (
                          !dragState ||
                          dragState.mode !== 'resize-left' ||
                          dragState.pointerId !== event.pointerId ||
                          dragState.lineId !== line.id
                        ) {
                          return;
                        }

                        dragStateRef.current = null;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        onCancelSegmentDrag();
                      }}
                    />
                  ) : null}
                  {labelMode === 'lyric' ? (
                    <>
                      <span className="timeline-segment-label">{line.text}</span>
                    </>
                  ) : null}
                  {labelMode === 'index' ? (
                    <span className="timeline-segment-index">{line.index + 1}</span>
                  ) : null}
                  {canShowSingleSelectionManipulators ? (
                    <span
                      className="timeline-segment-handle timeline-segment-handle-right"
                      aria-hidden="true"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        dragStateRef.current = {
                          mode: 'resize-right',
                          pointerId: event.pointerId,
                          lineId: line.id,
                          selectedLineIds: [line.id],
                          startClientX: event.clientX,
                          windowDurationMs: visibleWindowMs,
                          originalStartMs: segment.startMs,
                          originalEndMs: segment.endMs,
                          hasDragged: true,
                        };
                        setFollowPlayhead(false);
                        setManualWindowStartMs(visibleStartMs);
                        selectOnlySegment(line.id);
                        onPreviewSegmentDrag([
                          { lineId: line.id, startMs: segment.startMs, endMs: segment.endMs },
                        ]);
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const dragState = dragStateRef.current;
                        if (
                          !dragState ||
                          dragState.mode !== 'resize-right' ||
                          dragState.pointerId !== event.pointerId ||
                          dragState.lineId !== line.id
                        ) {
                          return;
                        }

                        updateDraggedSegments(
                          event.clientX - dragState.startClientX,
                          dragState,
                        );
                      }}
                      onPointerUp={(event) => {
                        const dragState = dragStateRef.current;
                        if (
                          !dragState ||
                          dragState.mode !== 'resize-right' ||
                          dragState.pointerId !== event.pointerId ||
                          dragState.lineId !== line.id
                        ) {
                          return;
                        }

                        const nextSegments = updateDraggedSegments(
                          event.clientX - dragState.startClientX,
                          dragState,
                        );
                        dragStateRef.current = null;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        onCommitSegmentDrag(nextSegments);
                      }}
                      onPointerCancel={(event) => {
                        const dragState = dragStateRef.current;
                        if (
                          !dragState ||
                          dragState.mode !== 'resize-right' ||
                          dragState.pointerId !== event.pointerId ||
                          dragState.lineId !== line.id
                        ) {
                          return;
                        }

                        dragStateRef.current = null;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        onCancelSegmentDrag();
                      }}
                    />
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
