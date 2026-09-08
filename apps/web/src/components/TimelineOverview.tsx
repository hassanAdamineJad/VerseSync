import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Minus, Plus } from "lucide-react";
import {
  formatTime,
  getSeekStepMs,
  type CompletedSegment,
  type EditorState,
} from "../editor";
import {
  buildSnapTargets,
  findNearestSnap,
  getSnapThresholdMs,
} from "../timelineSnapping";

type Props = {
  editor: EditorState;
  dragPreviewSegments: CompletedSegment[] | null;
  linePlacementPreview: {
    lineId: string;
    text: string;
    clientX: number;
    clientY: number;
    segment: CompletedSegment | null;
    snapTargetMs: number | null;
  } | null;
  currentTimeMs: number;
  onSelectedSegmentCountChange: (count: number) => void;
  onSelectSegment: (lineId: string) => void;
  onPreviewSegmentDrag: (segments: CompletedSegment[]) => void;
  onCommitSegmentDrag: (segments: CompletedSegment[]) => void;
  onCancelSegmentDrag: () => void;
  onSeek: (nextMs: number) => void;
  viewportCenterRequest: {
    lineId: string;
    centerMs: number;
    token: number;
  } | null;
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

type WindowPreset = 15 | 30 | 60 | "full";

const FULL_PEAK_COUNT = 720;
const VISIBLE_PEAK_COUNT = 120;
const WINDOW_PRESETS: WindowPreset[] = [15, 30, 60, "full"];
const DEFAULT_WINDOW_MS = 15_000;
const MIN_WINDOW_PRESET_MS = 15_000;
const ZOOM_WHEEL_SENSITIVITY = 0.008;
const PAN_WHEEL_SCALE = 1.2;
const PRESET_MATCH_EPSILON_MS = 50;
const MIN_RULER_LABEL_SPACING_PX = 90;
const NICE_RULER_INTERVALS_MS = [
  500, 1_000, 2_000, 3_000, 5_000, 10_000, 15_000, 30_000, 60_000,
];

type RulerTick = {
  valueMs: number;
  showLabel: boolean;
  align: "start" | "center" | "end";
};

type SeekGesture = {
  pointerId: number;
  left: number;
  width: number;
  visibleStartMs: number;
  visibleWindowMs: number;
};

type NavigatorGesture = {
  pointerId: number;
  left: number;
  width: number;
  pointerOffsetPx: number;
};

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
          throw new Error("Waveform preview could not load this audio source.");
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
          error: "Waveform preview unavailable for this audio source.",
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
  const clampedStartMs = Math.min(
    Math.max(0, startMs),
    Math.max(0, durationMs - windowMs),
  );
  const endMs = Math.min(durationMs, clampedStartMs + windowMs);

  return {
    startMs: clampedStartMs,
    endMs,
    windowMs: Math.max(1, endMs - clampedStartMs),
  };
}

function getMinWindowMs(durationMs: number) {
  return Math.min(MIN_WINDOW_PRESET_MS, Math.max(1, durationMs));
}

function getMaxWindowMs(durationMs: number) {
  return Math.max(1, durationMs);
}

function clampRequestedWindowMs(windowMs: number, durationMs: number) {
  return Math.min(
    Math.max(Math.round(windowMs), getMinWindowMs(durationMs)),
    getMaxWindowMs(durationMs),
  );
}

function getPresetWindowMs(preset: WindowPreset, durationMs: number) {
  return clampRequestedWindowMs(
    preset === "full" ? durationMs : preset * 1000,
    durationMs,
  );
}

function getNextPresetWindowMs(
  currentWindowMs: number,
  durationMs: number,
  direction: "in" | "out",
) {
  const uniquePresets = [
    ...new Set(
      WINDOW_PRESETS.map((preset) => getPresetWindowMs(preset, durationMs)),
    ),
  ].sort((a, b) => a - b);

  if (direction === "in") {
    return (
      [...uniquePresets]
        .reverse()
        .find((ms) => ms < currentWindowMs - PRESET_MATCH_EPSILON_MS) ??
      uniquePresets[0] ??
      currentWindowMs
    );
  }

  return (
    uniquePresets.find(
      (ms) => ms > currentWindowMs + PRESET_MATCH_EPSILON_MS,
    ) ??
    uniquePresets.at(-1) ??
    currentWindowMs
  );
}

function formatWindowControlLabel(windowMs: number, durationMs: number) {
  if (windowMs >= durationMs - 1) return "Full";
  return `${Math.max(1, Math.round(windowMs / 1000))}s`;
}

function formatWindowCopyLabel(windowMs: number, durationMs: number) {
  if (windowMs >= durationMs - 1) return "Full track";
  return `${Math.max(1, Math.round(windowMs / 1000))} seconds`;
}

function normalizeWheelDelta(delta: number, deltaMode: number) {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 800;
  return delta;
}

function timeAtClientX(
  clientX: number,
  left: number,
  width: number,
  startMs: number,
  windowMs: number,
) {
  const ratio = width <= 0 ? 0 : (clientX - left) / width;
  return startMs + Math.min(Math.max(ratio, 0), 1) * windowMs;
}

function zoomViewportAt(
  factor: number,
  anchorMs: number,
  startMs: number,
  windowMs: number,
  durationMs: number,
) {
  const nextWindowMs = clampRequestedWindowMs(windowMs * factor, durationMs);
  const frac = windowMs <= 0 ? 0.5 : (anchorMs - startMs) / windowMs;
  const nextStartMs = anchorMs - frac * nextWindowMs;
  const next = getWindowFromStart(durationMs, nextWindowMs, nextStartMs);
  return { startMs: next.startMs, windowMs: nextWindowMs };
}

function panViewportByDelta(
  deltaPx: number,
  widthPx: number,
  startMs: number,
  windowMs: number,
  durationMs: number,
) {
  const deltaMs = (deltaPx / Math.max(widthPx, 1)) * windowMs * PAN_WHEEL_SCALE;
  const next = getWindowFromStart(durationMs, windowMs, startMs + deltaMs);
  return { startMs: next.startMs, windowMs };
}

function getNiceRulerIntervalMs(minimumIntervalMs: number): number {
  for (const intervalMs of NICE_RULER_INTERVALS_MS) {
    if (intervalMs >= minimumIntervalMs) return intervalMs;
  }

  let intervalMs =
    NICE_RULER_INTERVALS_MS[NICE_RULER_INTERVALS_MS.length - 1] ?? 60_000;
  while (intervalMs < minimumIntervalMs) {
    intervalMs *= 2;
  }
  return intervalMs;
}

function getMinorRulerIntervalMs(labelIntervalMs: number): number {
  const smallerIntervals = NICE_RULER_INTERVALS_MS.filter(
    (intervalMs) => intervalMs < labelIntervalMs,
  );
  return smallerIntervals.at(-1) ?? labelIntervalMs;
}

function buildRulerTicks(
  windowStartMs: number,
  windowEndMs: number,
  windowDurationMs: number,
  rulerWidthPx: number,
): RulerTick[] {
  const safeWidthPx = Math.max(rulerWidthPx, MIN_RULER_LABEL_SPACING_PX);
  const minimumLabelIntervalMs =
    (windowDurationMs * MIN_RULER_LABEL_SPACING_PX) / safeWidthPx;
  const labelIntervalMs = getNiceRulerIntervalMs(minimumLabelIntervalMs);
  const minorIntervalMs = getMinorRulerIntervalMs(labelIntervalMs);
  const ticks = new Map<number, RulerTick>();
  const labelCandidates = new Set<number>();

  const getAlignment = (valueMs: number): RulerTick["align"] => {
    const leftPx =
      ((valueMs - windowStartMs) / Math.max(windowDurationMs, 1)) * safeWidthPx;
    const rightPx = safeWidthPx - leftPx;
    return leftPx < MIN_RULER_LABEL_SPACING_PX / 2
      ? "start"
      : rightPx < MIN_RULER_LABEL_SPACING_PX / 2
        ? "end"
        : "center";
  };

  const addTick = (valueMs: number) => {
    const clampedValueMs = Math.min(
      Math.max(valueMs, windowStartMs),
      windowEndMs,
    );
    if (ticks.has(clampedValueMs)) return;
    ticks.set(clampedValueMs, {
      valueMs: clampedValueMs,
      showLabel: false,
      align: getAlignment(clampedValueMs),
    });
  };

  for (
    let tickMs = Math.floor(windowStartMs / minorIntervalMs) * minorIntervalMs;
    tickMs <= windowEndMs;
    tickMs += minorIntervalMs
  ) {
    if (tickMs < windowStartMs) continue;
    addTick(tickMs);
    if (tickMs % labelIntervalMs === 0) {
      labelCandidates.add(tickMs);
    }
  }

  addTick(windowStartMs);
  addTick(windowEndMs);
  labelCandidates.add(windowStartMs);
  labelCandidates.add(windowEndMs);

  let lastLabeledLeftPx = Number.NEGATIVE_INFINITY;
  for (const candidateMs of [...labelCandidates].sort((a, b) => a - b)) {
    const leftPx =
      ((candidateMs - windowStartMs) / Math.max(windowDurationMs, 1)) *
      safeWidthPx;
    if (leftPx - lastLabeledLeftPx < MIN_RULER_LABEL_SPACING_PX) {
      continue;
    }

    const tick = ticks.get(candidateMs);
    if (!tick) continue;
    tick.showLabel = true;
    lastLabeledLeftPx = leftPx;
  }

  return [...ticks.values()].sort((a, b) => a.valueMs - b.valueMs);
}

function toWindowPercent(
  valueMs: number,
  windowStartMs: number,
  windowDurationMs: number,
) {
  return ((valueMs - windowStartMs) / windowDurationMs) * 100;
}

function formatRulerLabel(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
      windowStartMs +
      (index / VISIBLE_PEAK_COUNT) * (windowEndMs - windowStartMs);
    const bucketEndMs =
      windowStartMs +
      ((index + 1) / VISIBLE_PEAK_COUNT) * (windowEndMs - windowStartMs);
    const startPeakIndex = Math.floor(
      (bucketStartMs / durationMs) * peaks.length,
    );
    const endPeakIndex = Math.max(
      startPeakIndex + 1,
      Math.ceil((bucketEndMs / durationMs) * peaks.length),
    );

    let max = 0;
    for (
      let peakIndex = startPeakIndex;
      peakIndex < endPeakIndex;
      peakIndex += 1
    ) {
      max = Math.max(max, peaks[peakIndex] ?? 0);
    }
    visiblePeaks.push(Math.max(0.04, max));
  }

  return visiblePeaks;
}

type DragState = {
  mode: "move" | "resize-left" | "resize-right";
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
  onSelectedSegmentCountChange,
  onSelectSegment,
  onPreviewSegmentDrag,
  onCommitSegmentDrag,
  onCancelSegmentDrag,
  onSeek,
  onTimelineLaneMetricsChange,
  viewportCenterRequest,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const waveformGradientId = `waveform-gradient-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const dragStateRef = useRef<DragState | null>(null);
  const seekGestureRef = useRef<SeekGesture | null>(null);
  const navigatorGestureRef = useRef<NavigatorGesture | null>(null);
  const viewportFrameRef = useRef<number | null>(null);
  const pendingViewportRef = useRef<{
    startMs: number;
    windowMs: number;
  } | null>(null);
  const viewportInteractionRef = useRef({
    durationMs: 0,
    visibleStartMs: 0,
    visibleWindowMs: DEFAULT_WINDOW_MS,
    resolvedWindowMs: DEFAULT_WINDOW_MS,
  });
  const durationMs = editor.document.durationMs;
  const audioUrl = editor.document.source.audioUrl;
  const { peaks, error } = useWaveformPeaks(audioUrl);
  const [laneWidthPx, setLaneWidthPx] = useState(0);
  const [rulerWidthPx, setRulerWidthPx] = useState(0);
  const [requestedWindowMs, setRequestedWindowMs] = useState(DEFAULT_WINDOW_MS);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [manualWindowStartMs, setManualWindowStartMs] = useState(0);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [activeSnapTargetMs, setActiveSnapTargetMs] = useState<number | null>(
    null,
  );
  const resolvedWindowMs = clampRequestedWindowMs(
    requestedWindowMs,
    durationMs,
  );
  const centeredWindow = useMemo(
    () => getCenteredWindow(durationMs, currentTimeMs, resolvedWindowMs),
    [currentTimeMs, durationMs, resolvedWindowMs],
  );
  const manualWindow = useMemo(
    () => getWindowFromStart(durationMs, resolvedWindowMs, manualWindowStartMs),
    [durationMs, manualWindowStartMs, resolvedWindowMs],
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
    const ruler = rulerRef.current;
    if (!ruler) return;

    const updateWidth = () => {
      setRulerWidthPx(ruler.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(ruler);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setRequestedWindowMs(DEFAULT_WINDOW_MS);
    setFollowPlayhead(true);
    setManualWindowStartMs(0);
    const initiallySelectedLineId =
      editor.selectedLineId && editor.segments[editor.selectedLineId]
        ? editor.selectedLineId
        : null;
    setSelectedLineIds(
      initiallySelectedLineId ? [initiallySelectedLineId] : [],
    );
  }, [audioUrl]);

  useEffect(() => {
    if (followPlayhead) {
      setManualWindowStartMs(centeredWindow.startMs);
      return;
    }

    setManualWindowStartMs(
      (current) =>
        getWindowFromStart(durationMs, resolvedWindowMs, current).startMs,
    );
  }, [centeredWindow.startMs, durationMs, followPlayhead, resolvedWindowMs]);

  const appliedViewportCenterTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (viewportCenterRequest == null) return;
    if (appliedViewportCenterTokenRef.current === viewportCenterRequest.token) {
      return;
    }
    appliedViewportCenterTokenRef.current = viewportCenterRequest.token;
    setFollowPlayhead(false);
    setManualWindowStartMs(
      getCenteredWindow(
        durationMs,
        viewportCenterRequest.centerMs,
        resolvedWindowMs,
      ).startMs,
    );
  }, [durationMs, resolvedWindowMs, viewportCenterRequest]);

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
  const selectedLineIdSet = useMemo(
    () => new Set(selectedLineIds),
    [selectedLineIds],
  );
  const primarySelectedLineId = selectedLineIds.at(-1) ?? null;
  const hasMultiSelection = selectedLineIds.length > 1;

  useEffect(() => {
    setSelectedLineIds((current) => {
      const next = current.filter((lineId) => editor.segments[lineId] != null);
      if (editor.selectedLineId && editor.segments[editor.selectedLineId]) {
        if (
          next.includes(editor.selectedLineId) &&
          next.length === current.length
        ) {
          return current;
        }
        return next.includes(editor.selectedLineId)
          ? next
          : [editor.selectedLineId];
      }
      if (next.length === current.length) return current;
      return next;
    });
  }, [editor.selectedLineId, editor.segments, selectedLineIdSet]);

  useEffect(() => {
    onSelectedSegmentCountChange(selectedLineIds.length);
  }, [onSelectedSegmentCountChange, selectedLineIds.length]);

  const ticks = useMemo(
    () =>
      buildRulerTicks(
        visibleStartMs,
        visibleEndMs,
        visibleWindowMs,
        rulerWidthPx,
      ),
    [rulerWidthPx, visibleEndMs, visibleStartMs, visibleWindowMs],
  );
  const visiblePeaks = useMemo(
    () => sampleVisiblePeaks(peaks, durationMs, visibleStartMs, visibleEndMs),
    [durationMs, peaks, visibleEndMs, visibleStartMs],
  );
  const waveformBars = useMemo(
    () =>
      visiblePeaks.map((peak, index) => {
        const height = Math.max(8, peak * 92);
        const y = (100 - height) / 2;
        return {
          key: `${index}-${peak}`,
          x: index + 0.4,
          y,
          width: 0.2,
          height,
        };
      }),
    [visiblePeaks],
  );
  const visibleSegments = useMemo(
    () =>
      timedSegments
        .map(({ line, segment }) => {
          const previewSegment =
            dragPreviewSegments?.find(
              (preview) => preview.lineId === line.id,
            ) ?? segment;
          if (
            previewSegment.endMs <= visibleStartMs ||
            previewSegment.startMs >= visibleEndMs
          ) {
            return null;
          }

          const clippedStartMs = Math.max(
            previewSegment.startMs,
            visibleStartMs,
          );
          const clippedEndMs = Math.min(previewSegment.endMs, visibleEndMs);
          const left = toWindowPercent(
            clippedStartMs,
            visibleStartMs,
            visibleWindowMs,
          );
          const width =
            toWindowPercent(clippedEndMs, visibleStartMs, visibleWindowMs) -
            left;
          const widthPx = (Math.max(width, 0) / 100) * laneWidthPx;
          const labelMode =
            widthPx >= 36 ? "lyric" : widthPx >= 20 ? "index" : "none";

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
  const liveCapturePreview = useMemo(() => {
    const openSegment = editor.openSegment;
    if (!openSegment) return null;

    const line = editor.document.lines.find(
      (entry) => entry.id === openSegment.lineId,
    );
    if (!line) return null;

    const previewEndMs = Math.min(
      Math.max(currentTimeMs, openSegment.startMs),
      editor.document.durationMs,
    );
    if (previewEndMs < visibleStartMs || openSegment.startMs > visibleEndMs) {
      return null;
    }

    const clippedStartMs = Math.max(openSegment.startMs, visibleStartMs);
    const clippedEndMs = Math.min(previewEndMs, visibleEndMs);
    const left = toWindowPercent(
      clippedStartMs,
      visibleStartMs,
      visibleWindowMs,
    );
    const width = Math.max(
      0,
      toWindowPercent(clippedEndMs, visibleStartMs, visibleWindowMs) - left,
    );
    return {
      line,
      startMs: openSegment.startMs,
      endMs: previewEndMs,
      left,
      width,
    };
  }, [
    currentTimeMs,
    editor.document.durationMs,
    editor.document.lines,
    editor.openSegment,
    visibleEndMs,
    visibleStartMs,
    visibleWindowMs,
  ]);
  const playheadPercent = toWindowPercent(
    currentTimeMs,
    visibleStartMs,
    visibleWindowMs,
  );
  const clampedPlayheadPercent = Math.min(Math.max(playheadPercent, 0), 100);
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
        ) -
        toWindowPercent(
          linePlacementPreview.segment.startMs,
          visibleStartMs,
          visibleWindowMs,
        )
      : null;
  const snapGuideMs =
    activeSnapTargetMs ?? linePlacementPreview?.snapTargetMs ?? null;
  const snapGuidePercent =
    snapGuideMs != null
      ? toWindowPercent(snapGuideMs, visibleStartMs, visibleWindowMs)
      : null;
  const canZoomIn = resolvedWindowMs > getMinWindowMs(durationMs) + 1;
  const canZoomOut = resolvedWindowMs < getMaxWindowMs(durationMs) - 1;
  const currentWindowLabel = formatWindowCopyLabel(visibleWindowMs, durationMs);
  const currentWindowControlLabel = formatWindowControlLabel(
    resolvedWindowMs,
    durationMs,
  );
  const navigationMaxMs = Math.max(
    0,
    durationMs - Math.min(resolvedWindowMs, durationMs),
  );
  const visibleRangeLabel = `${formatTime(visibleStartMs)}-${formatTime(visibleEndMs)}`;
  const navigatorThumbLeftPercent =
    durationMs <= 0 ? 0 : (visibleStartMs / durationMs) * 100;
  const navigatorThumbWidthPercent =
    durationMs <= 0 ? 100 : (visibleWindowMs / durationMs) * 100;
  const seekStepMs = getSeekStepMs(visibleWindowMs);

  const seekWithinVisibleWindow = (nextMs: number) => {
    const clampedMs = Math.min(
      Math.max(visibleStartMs, Math.round(nextMs)),
      visibleEndMs,
    );
    onSeek(clampedMs);
  };

  const seekFromClientX = (
    clientX: number,
    left: number,
    width: number,
    windowStartMs: number,
    windowDurationMs: number,
  ) => {
    const ratio = width <= 0 ? 0 : (clientX - left) / width;
    const nextMs =
      windowStartMs + Math.min(Math.max(ratio, 0), 1) * windowDurationMs;
    const clampedMs = Math.min(
      Math.max(windowStartMs, Math.round(nextMs)),
      windowStartMs + windowDurationMs,
    );
    onSeek(clampedMs);
  };

  const clampNavigatorStartMs = (nextStartMs: number) =>
    Math.min(Math.max(0, Math.round(nextStartMs)), navigationMaxMs);

  const panTimelineWindow = (nextStartMs: number) => {
    if (navigationMaxMs === 0) return;
    setFollowPlayhead(false);
    setManualWindowStartMs(clampNavigatorStartMs(nextStartMs));
  };

  viewportInteractionRef.current = {
    durationMs,
    visibleStartMs,
    visibleWindowMs,
    resolvedWindowMs,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const flushPendingViewport = () => {
      viewportFrameRef.current = null;
      const pending = pendingViewportRef.current;
      if (!pending) return;
      pendingViewportRef.current = null;
      setFollowPlayhead(false);
      setRequestedWindowMs(pending.windowMs);
      setManualWindowStartMs(pending.startMs);
    };

    const scheduleViewport = (startMs: number, windowMs: number) => {
      pendingViewportRef.current = { startMs, windowMs };
      viewportInteractionRef.current.visibleStartMs = startMs;
      viewportInteractionRef.current.visibleWindowMs = Math.min(
        windowMs,
        viewportInteractionRef.current.durationMs,
      );
      viewportInteractionRef.current.resolvedWindowMs = windowMs;
      if (viewportFrameRef.current != null) return;
      viewportFrameRef.current =
        window.requestAnimationFrame(flushPendingViewport);
    };

    const handleWheel = (event: WheelEvent) => {
      if (dragStateRef.current != null || navigatorGestureRef.current != null) {
        return;
      }

      const isZoom = event.metaKey || event.ctrlKey;
      const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
      const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);

      if (isZoom) {
        if (deltaY === 0) return;
        if (event.cancelable) event.preventDefault();

        const live = pendingViewportRef.current ?? {
          startMs: viewportInteractionRef.current.visibleStartMs,
          windowMs: viewportInteractionRef.current.visibleWindowMs,
        };
        const rect = canvas.getBoundingClientRect();
        const next = zoomViewportAt(
          Math.exp(deltaY * ZOOM_WHEEL_SENSITIVITY),
          timeAtClientX(
            event.clientX,
            rect.left,
            rect.width,
            live.startMs,
            live.windowMs,
          ),
          live.startMs,
          live.windowMs,
          viewportInteractionRef.current.durationMs,
        );
        scheduleViewport(next.startMs, next.windowMs);
        return;
      }

      if (deltaX === 0 && deltaY === 0) return;
      if (event.cancelable) event.preventDefault();

      const live = pendingViewportRef.current ?? {
        startMs: viewportInteractionRef.current.visibleStartMs,
        windowMs: viewportInteractionRef.current.visibleWindowMs,
      };
      const panDeltaPx = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      const next = panViewportByDelta(
        panDeltaPx,
        canvas.clientWidth,
        live.startMs,
        live.windowMs,
        viewportInteractionRef.current.durationMs,
      );
      scheduleViewport(next.startMs, live.windowMs);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      if (viewportFrameRef.current != null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
    };
  }, []);

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
    window.addEventListener("scroll", publishMetrics, true);
    window.addEventListener("resize", publishMetrics);

    return () => {
      window.removeEventListener("scroll", publishMetrics, true);
      window.removeEventListener("resize", publishMetrics);
    };
  }, [
    durationMs,
    onTimelineLaneMetricsChange,
    visibleStartMs,
    visibleWindowMs,
  ]);

  const getDraggedSegment = (
    deltaClientX: number,
    dragState: DragState,
    snappingDisabled: boolean,
  ) => {
    const laneWidth = laneWidthPx || 1;
    const deltaMs = Math.round(
      (deltaClientX / laneWidth) * dragState.windowDurationMs,
    );
    const thresholdMs = getSnapThresholdMs(
      dragState.windowDurationMs,
      laneWidth,
    );

    if (dragState.mode === "move") {
      const segmentDurationMs =
        dragState.originalEndMs - dragState.originalStartMs;
      const maxStartMs = Math.max(0, durationMs - segmentDurationMs);
      let startMs = Math.min(
        Math.max(0, dragState.originalStartMs + deltaMs),
        maxStartMs,
      );
      let snapTargetMs: number | null = null;
      if (!snappingDisabled) {
        const targets = buildSnapTargets(
          editor.segments,
          dragState.selectedLineIds.includes(dragState.lineId)
            ? dragState.selectedLineIds
            : [dragState.lineId],
          currentTimeMs,
        );
        const candidateLeadingMs = startMs;
        const candidateTrailingMs = startMs + segmentDurationMs;
        const snappedEdgeMs = findNearestSnap(
          [candidateLeadingMs, candidateTrailingMs],
          targets,
          thresholdMs,
          (targetMs) => {
            const edgeToMatch =
              Math.abs(targetMs - candidateLeadingMs) <=
              Math.abs(targetMs - candidateTrailingMs)
                ? candidateLeadingMs
                : candidateTrailingMs;
            const proposedStartMs =
              edgeToMatch === candidateLeadingMs
                ? targetMs
                : targetMs - segmentDurationMs;
            return proposedStartMs >= 0 && proposedStartMs <= maxStartMs;
          },
        );
        if (snappedEdgeMs != null) {
          const snapFromStartDistance = Math.abs(
            snappedEdgeMs - candidateLeadingMs,
          );
          const snapFromEndDistance = Math.abs(
            snappedEdgeMs - candidateTrailingMs,
          );
          startMs =
            snapFromStartDistance <= snapFromEndDistance
              ? snappedEdgeMs
              : snappedEdgeMs - segmentDurationMs;
          snapTargetMs = snappedEdgeMs;
        }
      }
      return { startMs, endMs: startMs + segmentDurationMs, snapTargetMs };
    }

    if (dragState.mode === "resize-left") {
      let startMs = Math.min(
        Math.max(0, dragState.originalStartMs + deltaMs),
        dragState.originalEndMs - 1,
      );
      let snapTargetMs: number | null = null;
      if (!snappingDisabled) {
        const snappedStartMs = findNearestSnap(
          [startMs],
          buildSnapTargets(editor.segments, [dragState.lineId], currentTimeMs),
          thresholdMs,
          (targetMs) => targetMs >= 0 && targetMs < dragState.originalEndMs,
        );
        if (snappedStartMs != null) {
          startMs = snappedStartMs;
          snapTargetMs = snappedStartMs;
        }
      }
      return { startMs, endMs: dragState.originalEndMs, snapTargetMs };
    }

    let endMs = Math.max(
      Math.min(durationMs, dragState.originalEndMs + deltaMs),
      dragState.originalStartMs + 1,
    );
    let snapTargetMs: number | null = null;
    if (!snappingDisabled) {
      const snappedEndMs = findNearestSnap(
        [endMs],
        buildSnapTargets(editor.segments, [dragState.lineId], currentTimeMs),
        thresholdMs,
        (targetMs) =>
          targetMs > dragState.originalStartMs && targetMs <= durationMs,
      );
      if (snappedEndMs != null) {
        endMs = snappedEndMs;
        snapTargetMs = snappedEndMs;
      }
    }
    return { startMs: dragState.originalStartMs, endMs, snapTargetMs };
  };

  const updateDraggedSegments = (
    deltaClientX: number,
    dragState: DragState,
    snappingDisabled: boolean,
  ) => {
    const selectedGroupLineIds =
      dragState.mode === "move" &&
      dragState.selectedLineIds.includes(dragState.lineId)
        ? dragState.selectedLineIds
        : [dragState.lineId];

    const baseSegments = selectedGroupLineIds
      .map((lineId) => editor.segments[lineId])
      .filter((segment): segment is CompletedSegment => segment != null);

    if (dragState.mode !== "move") {
      const nextSegment = getDraggedSegment(
        deltaClientX,
        dragState,
        snappingDisabled,
      );
      const previewSegments = [
        {
          lineId: dragState.lineId,
          startMs: nextSegment.startMs,
          endMs: nextSegment.endMs,
        },
      ];
      setActiveSnapTargetMs(nextSegment.snapTargetMs);
      onPreviewSegmentDrag(previewSegments);
      return previewSegments;
    }

    const laneWidth = laneWidthPx || 1;
    const rawDeltaMs = Math.round(
      (deltaClientX / laneWidth) * dragState.windowDurationMs,
    );
    const earliestStartMs = Math.min(
      ...baseSegments.map((segment) => segment.startMs),
    );
    const latestEndMs = Math.max(
      ...baseSegments.map((segment) => segment.endMs),
    );
    const minDeltaMs = -earliestStartMs;
    const maxDeltaMs = durationMs - latestEndMs;
    let appliedDeltaMs = Math.min(
      Math.max(rawDeltaMs, -earliestStartMs),
      durationMs - latestEndMs,
    );
    let snapTargetMs: number | null = null;

    if (!snappingDisabled) {
      const candidateLeadingMs = earliestStartMs + appliedDeltaMs;
      const candidateTrailingMs = latestEndMs + appliedDeltaMs;
      const snappedEdgeMs = findNearestSnap(
        [candidateLeadingMs, candidateTrailingMs],
        buildSnapTargets(editor.segments, selectedGroupLineIds, currentTimeMs),
        getSnapThresholdMs(dragState.windowDurationMs, laneWidth),
        (targetMs) => {
          const edgeToMatch =
            Math.abs(targetMs - candidateLeadingMs) <=
            Math.abs(targetMs - candidateTrailingMs)
              ? candidateLeadingMs
              : candidateTrailingMs;
          const proposedDeltaMs = appliedDeltaMs + (targetMs - edgeToMatch);
          return proposedDeltaMs >= minDeltaMs && proposedDeltaMs <= maxDeltaMs;
        },
      );
      if (snappedEdgeMs != null) {
        const snapFromStartDistance = Math.abs(
          snappedEdgeMs - candidateLeadingMs,
        );
        const snapFromEndDistance = Math.abs(
          snappedEdgeMs - candidateTrailingMs,
        );
        appliedDeltaMs =
          appliedDeltaMs +
          (snapFromStartDistance <= snapFromEndDistance
            ? snappedEdgeMs - candidateLeadingMs
            : snappedEdgeMs - candidateTrailingMs);
        snapTargetMs = snappedEdgeMs;
      }
    }

    const previewSegments = baseSegments.map((segment) => ({
      lineId: segment.lineId,
      startMs: segment.startMs + appliedDeltaMs,
      endMs: segment.endMs + appliedDeltaMs,
    }));

    setActiveSnapTargetMs(snapTargetMs);
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
          <h2 id="timeline-title">Alignment timeline</h2>
          <p className="timeline-window-copy">
            Two-finger scroll to pan
            <span aria-hidden="true"> · </span>
            Pinch or ⌘/Ctrl + scroll to zoom
          </p>
        </div>
        <div className="timeline-header-actions">
          {hasMultiSelection ? (
            <div
              className="timeline-selection-summary"
              role="status"
              aria-live="polite"
            >
              <strong>{selectedLineIds.length} segments selected</strong>
              <p>Drag any selected segment to move the group.</p>
            </div>
          ) : null}
          <span className="source-badge">
            Timed lines {timedSegments.length}
          </span>
          <div className="timeline-zoom-controls" aria-label="Timeline zoom">
            <span className="timeline-zoom-label">Zoom</span>
            <button
              type="button"
              aria-label="Zoom in timeline"
              onClick={() => {
                if (!canZoomIn) return;
                setRequestedWindowMs(
                  getNextPresetWindowMs(resolvedWindowMs, durationMs, "in"),
                );
              }}
              disabled={!canZoomIn}
            >
              <Minus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
            <span className="timeline-window-value">
              {currentWindowControlLabel}
            </span>
            <button
              type="button"
              aria-label="Zoom out timeline"
              onClick={() => {
                if (!canZoomOut) return;
                setRequestedWindowMs(
                  getNextPresetWindowMs(resolvedWindowMs, durationMs, "out"),
                );
              }}
              disabled={!canZoomOut}
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <div ref={canvasRef} className="timeline-canvas">
        <div
          ref={rulerRef}
          className="timeline-ruler"
          aria-hidden="true"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            seekFromClientX(
              event.clientX,
              rect.left,
              rect.width,
              visibleStartMs,
              visibleWindowMs,
            );
          }}
        >
          {ticks.map((tick) => {
            const left = toWindowPercent(
              tick.valueMs,
              visibleStartMs,
              visibleWindowMs,
            );
            const labelStyle: CSSProperties =
              tick.align === "start"
                ? { position: "absolute", top: 0, left: `calc(${left}% + 4px)` }
                : tick.align === "end"
                  ? {
                      position: "absolute",
                      top: 0,
                      left: `calc(${left}% - 4px)`,
                      transform: "translateX(-100%)",
                    }
                  : {
                      position: "absolute",
                      top: 0,
                      left: `${left}%`,
                      transform: "translateX(-50%)",
                    };
            return (
              <Fragment
                key={`${tick.valueMs}-${tick.showLabel ? "label" : "minor"}`}
              >
                <div
                  className="timeline-tick"
                  data-labeled={tick.showLabel || undefined}
                  style={{ left: `${left}%` }}
                />
                {tick.showLabel ? (
                  <span className="timeline-tick-label" style={labelStyle}>
                    {formatRulerLabel(tick.valueMs)}
                  </span>
                ) : null}
              </Fragment>
            );
          })}
        </div>

        <div ref={surfaceRef} className="timeline-surface">
          <div className="timeline-grid" aria-hidden="true">
            {ticks.map((tick) => {
              const left = toWindowPercent(
                tick.valueMs,
                visibleStartMs,
                visibleWindowMs,
              );
              return (
                <div
                  key={`grid-${tick.valueMs}-${tick.showLabel ? "major" : "minor"}`}
                  className="timeline-grid-line"
                  data-labeled={tick.showLabel || undefined}
                  style={{ left: `${left}%` }}
                />
              );
            })}
          </div>
          {snapGuidePercent != null ? (
            <div
              className="timeline-snap-guide"
              style={{
                left: `${Math.min(Math.max(snapGuidePercent, 0), 100)}%`,
              }}
              aria-hidden="true"
            />
          ) : null}
          <div
            className="waveform-band"
            aria-label="Waveform preview"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              seekFromClientX(
                event.clientX,
                rect.left,
                rect.width,
                visibleStartMs,
                visibleWindowMs,
              );
            }}
          >
            {waveformBars.length > 0 ? (
              <svg
                className="waveform-svg"
                viewBox={`0 0 ${waveformBars.length} 100`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id={waveformGradientId}
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1="0%"
                    x2={String(waveformBars.length)}
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#fcd384" stopOpacity="0.52" />
                    <stop
                      offset={`${clampedPlayheadPercent}%`}
                      stopColor="#fcd384"
                      stopOpacity="0.52"
                    />
                    <stop
                      offset={`${clampedPlayheadPercent}%`}
                      stopColor="#e7e5e4"
                      stopOpacity="0.3"
                    />
                    <stop offset="100%" stopColor="#e7e5e4" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                <g
                  className="waveform-bars"
                  fill={`url(#${waveformGradientId})`}
                >
                  {waveformBars.map((bar) => (
                    <rect
                      key={bar.key}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                    />
                  ))}
                </g>
              </svg>
            ) : (
              <p className="timeline-note">
                {error ??
                  "Loading waveform preview from the current audio source…"}
              </p>
            )}
          </div>

          <div
            ref={laneRef}
            className="segment-lane"
            aria-label="Timed lyric segments"
          >
            {linePlacementPreview?.segment &&
            placementPreviewPercent != null &&
            placementPreviewWidthPercent != null ? (
              <>
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
                ({
                  line,
                  segment,
                  left,
                  width,
                  labelMode,
                  isSelected,
                  isPrimarySelected,
                  isPlaying,
                }) => {
                  const canShowSingleSelectionManipulators =
                    selectedLineIds.length <= 1 || isPrimarySelected;

                  return (
                    <button
                      type="button"
                      key={line.id}
                      className="timeline-segment"
                      data-selected={isSelected || undefined}
                      data-primary-selected={isPrimarySelected || undefined}
                      data-playing={isPlaying || undefined}
                      data-dragging={
                        dragStateRef.current?.lineId === line.id || undefined
                      }
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
                          mode: "move",
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

                        const deltaClientX =
                          event.clientX - dragState.startClientX;
                        if (!dragState.hasDragged) {
                          if (Math.abs(deltaClientX) < DRAG_START_THRESHOLD_PX)
                            return;
                          dragState.hasDragged = true;
                          setFollowPlayhead(false);
                          setManualWindowStartMs(visibleStartMs);
                          if (!dragState.selectedLineIds.includes(line.id)) {
                            selectOnlySegment(line.id);
                          }
                          onPreviewSegmentDrag([
                            {
                              lineId: line.id,
                              startMs: segment.startMs,
                              endMs: segment.endMs,
                            },
                          ]);
                        }

                        updateDraggedSegments(
                          deltaClientX,
                          dragState,
                          event.altKey,
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
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          );
                          setActiveSnapTargetMs(null);
                          return;
                        }

                        const nextSegments = updateDraggedSegments(
                          event.clientX - dragState.startClientX,
                          dragState,
                          event.altKey,
                        );
                        dragStateRef.current = null;
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                        setActiveSnapTargetMs(null);
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
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                        setActiveSnapTargetMs(null);
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
                              mode: "resize-left",
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
                              {
                                lineId: line.id,
                                startMs: segment.startMs,
                                endMs: segment.endMs,
                              },
                            ]);
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          }}
                          onPointerMove={(event) => {
                            const dragState = dragStateRef.current;
                            if (
                              !dragState ||
                              dragState.mode !== "resize-left" ||
                              dragState.pointerId !== event.pointerId ||
                              dragState.lineId !== line.id
                            ) {
                              return;
                            }

                            updateDraggedSegments(
                              event.clientX - dragState.startClientX,
                              dragState,
                              event.altKey,
                            );
                          }}
                          onPointerUp={(event) => {
                            const dragState = dragStateRef.current;
                            if (
                              !dragState ||
                              dragState.mode !== "resize-left" ||
                              dragState.pointerId !== event.pointerId ||
                              dragState.lineId !== line.id
                            ) {
                              return;
                            }

                            const nextSegments = updateDraggedSegments(
                              event.clientX - dragState.startClientX,
                              dragState,
                              event.altKey,
                            );
                            dragStateRef.current = null;
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                            setActiveSnapTargetMs(null);
                            onCommitSegmentDrag(nextSegments);
                          }}
                          onPointerCancel={(event) => {
                            const dragState = dragStateRef.current;
                            if (
                              !dragState ||
                              dragState.mode !== "resize-left" ||
                              dragState.pointerId !== event.pointerId ||
                              dragState.lineId !== line.id
                            ) {
                              return;
                            }

                            dragStateRef.current = null;
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                            setActiveSnapTargetMs(null);
                            onCancelSegmentDrag();
                          }}
                        />
                      ) : null}
                      {labelMode === "lyric" ? (
                        <>
                          <span className="timeline-segment-label">
                            {line.text}
                          </span>
                        </>
                      ) : null}
                      {labelMode === "index" ? (
                        <span className="timeline-segment-index">
                          {line.index + 1}
                        </span>
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
                              mode: "resize-right",
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
                              {
                                lineId: line.id,
                                startMs: segment.startMs,
                                endMs: segment.endMs,
                              },
                            ]);
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          }}
                          onPointerMove={(event) => {
                            const dragState = dragStateRef.current;
                            if (
                              !dragState ||
                              dragState.mode !== "resize-right" ||
                              dragState.pointerId !== event.pointerId ||
                              dragState.lineId !== line.id
                            ) {
                              return;
                            }

                            updateDraggedSegments(
                              event.clientX - dragState.startClientX,
                              dragState,
                              event.altKey,
                            );
                          }}
                          onPointerUp={(event) => {
                            const dragState = dragStateRef.current;
                            if (
                              !dragState ||
                              dragState.mode !== "resize-right" ||
                              dragState.pointerId !== event.pointerId ||
                              dragState.lineId !== line.id
                            ) {
                              return;
                            }

                            const nextSegments = updateDraggedSegments(
                              event.clientX - dragState.startClientX,
                              dragState,
                              event.altKey,
                            );
                            dragStateRef.current = null;
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                            setActiveSnapTargetMs(null);
                            onCommitSegmentDrag(nextSegments);
                          }}
                          onPointerCancel={(event) => {
                            const dragState = dragStateRef.current;
                            if (
                              !dragState ||
                              dragState.mode !== "resize-right" ||
                              dragState.pointerId !== event.pointerId ||
                              dragState.lineId !== line.id
                            ) {
                              return;
                            }

                            dragStateRef.current = null;
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                            setActiveSnapTargetMs(null);
                            onCancelSegmentDrag();
                          }}
                        />
                      ) : null}
                    </button>
                  );
                },
              )
            ) : !liveCapturePreview ? (
              <p className="timeline-note">
                {timedSegments.length > 0
                  ? `No timed segments are visible in this ${currentWindowLabel.toLowerCase()} window.`
                  : "Timed segments will appear here as you capture or load alignment data."}
              </p>
            ) : null}
            {liveCapturePreview ? (
              <div
                className="timeline-segment timeline-segment-capturing"
                style={{
                  left: `${liveCapturePreview.left}%`,
                  width: `${Math.max(liveCapturePreview.width, 0)}%`,
                }}
                title={`${liveCapturePreview.line.text}\nCapturing from ${formatTime(liveCapturePreview.startMs)}`}
                role="img"
                aria-label={`${liveCapturePreview.line.text} capturing from ${formatTime(liveCapturePreview.startMs)} to ${formatTime(liveCapturePreview.endMs)}`}
              >
                <span
                  className="timeline-segment-capture-dot"
                  aria-hidden="true"
                />
                <span className="timeline-segment-label">
                  {liveCapturePreview.line.text}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="timeline-playhead"
          style={{ left: `${clampedPlayheadPercent}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Playback position"
          aria-valuemin={visibleStartMs}
          aria-valuemax={visibleEndMs}
          aria-valuenow={Math.min(
            Math.max(currentTimeMs, visibleStartMs),
            visibleEndMs,
          )}
          aria-valuetext={formatTime(currentTimeMs)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              seekWithinVisibleWindow(currentTimeMs - seekStepMs);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              seekWithinVisibleWindow(currentTimeMs + seekStepMs);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const surface = surfaceRef.current;
            if (!surface) return;

            const rect = surface.getBoundingClientRect();
            seekGestureRef.current = {
              pointerId: event.pointerId,
              left: rect.left,
              width: rect.width,
              visibleStartMs,
              visibleWindowMs,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromClientX(
              event.clientX,
              rect.left,
              rect.width,
              visibleStartMs,
              visibleWindowMs,
            );
          }}
          onPointerMove={(event) => {
            const seekGesture = seekGestureRef.current;
            if (!seekGesture || seekGesture.pointerId !== event.pointerId)
              return;
            seekFromClientX(
              event.clientX,
              seekGesture.left,
              seekGesture.width,
              seekGesture.visibleStartMs,
              seekGesture.visibleWindowMs,
            );
          }}
          onPointerUp={(event) => {
            if (seekGestureRef.current?.pointerId !== event.pointerId) return;
            seekGestureRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (seekGestureRef.current?.pointerId !== event.pointerId) return;
            seekGestureRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            seekGestureRef.current = null;
          }}
        />
      </div>

      <div className="timeline-navigation">
        <div className="timeline-navigation-row">
          <div
            className="timeline-navigator"
            aria-label={`Visible timeline window ${visibleRangeLabel}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0 || navigationMaxMs === 0) return;
              if (event.target !== event.currentTarget) return;

              const rect = event.currentTarget.getBoundingClientRect();
              const clickRatio =
                rect.width <= 0 ? 0 : (event.clientX - rect.left) / rect.width;
              const centeredStartMs =
                clickRatio * durationMs - visibleWindowMs / 2;
              panTimelineWindow(centeredStartMs);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div
              className="timeline-navigator-thumb"
              data-draggable={navigationMaxMs > 0 || undefined}
              style={{
                left: `${Math.min(Math.max(navigatorThumbLeftPercent, 0), 100)}%`,
                width: `${Math.min(Math.max(navigatorThumbWidthPercent, 0), 100)}%`,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button !== 0 || navigationMaxMs === 0) return;

                const navigatorRect =
                  event.currentTarget.parentElement?.getBoundingClientRect();
                if (!navigatorRect) return;
                const thumbRect = event.currentTarget.getBoundingClientRect();

                navigatorGestureRef.current = {
                  pointerId: event.pointerId,
                  left: navigatorRect.left,
                  width: navigatorRect.width,
                  pointerOffsetPx: event.clientX - thumbRect.left,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                const gesture = navigatorGestureRef.current;
                if (!gesture || gesture.pointerId !== event.pointerId) return;

                const nextLeftPx =
                  event.clientX - gesture.left - gesture.pointerOffsetPx;
                const nextStartMs =
                  gesture.width <= 0
                    ? 0
                    : (nextLeftPx / gesture.width) * durationMs;
                panTimelineWindow(nextStartMs);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (navigatorGestureRef.current?.pointerId !== event.pointerId)
                  return;
                navigatorGestureRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                if (navigatorGestureRef.current?.pointerId !== event.pointerId)
                  return;
                navigatorGestureRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onLostPointerCapture={() => {
                navigatorGestureRef.current = null;
              }}
            />
          </div>
        </div>
        <small>{visibleRangeLabel}</small>
      </div>
    </section>
  );
}
