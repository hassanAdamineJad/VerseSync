import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSnapTargets, findNearestSnap, getSnapThresholdMs } from '../timelineSnapping';
import type { CompletedSegment, EditorState } from '../editor';

export type LinePlacementPreview = {
  pointerId: number;
  lineId: string;
  lineIndex: number;
  text: string;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  hasDragged: boolean;
  segment: CompletedSegment | null;
  snapTargetMs: number | null;
} | null;

export type TimelineLaneMetrics = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  visibleStartMs: number;
  visibleWindowMs: number;
  durationMs: number;
} | null;

type PlacementComputation = {
  segment: CompletedSegment | null;
  snapTargetMs: number | null;
};

type Options = {
  editor: EditorState | null;
  currentTimeMs: number;
  onPlaceSegment: (segment: CompletedSegment) => void;
};

export function useLinePlacementDrag({
  editor,
  currentTimeMs,
  onPlaceSegment,
}: Options) {
  const [linePlacementPreview, setLinePlacementPreview] = useState<LinePlacementPreview>(null);
  const linePlacementPreviewRef = useRef<LinePlacementPreview>(null);
  const timelineLaneMetricsRef = useRef<TimelineLaneMetrics>(null);
  const placementListenersAttachedRef = useRef(false);
  const cancelPlacementDragRef = useRef<() => void>(() => {});
  const finishPlacementDragRef = useRef<() => void>(() => {});

  const updatePlacementPreviewState = useCallback((next: LinePlacementPreview) => {
    linePlacementPreviewRef.current = next;
    setLinePlacementPreview(next);
  }, []);

  const clearPlacementPreview = useCallback(() => {
    linePlacementPreviewRef.current = null;
    setLinePlacementPreview(null);
  }, []);

  const buildPlacementSegment = useCallback(
    (
      lineId: string,
      clientX: number,
      clientY: number,
      snappingDisabled: boolean,
    ): PlacementComputation => {
      const metrics = timelineLaneMetricsRef.current;
      if (!metrics || !editor) return { segment: null, snapTargetMs: null };

      const isInsideLane =
        clientX >= metrics.left &&
        clientX <= metrics.right &&
        clientY >= metrics.top &&
        clientY <= metrics.bottom;

      if (!isInsideLane) return { segment: null, snapTargetMs: null };

      const ratio =
        metrics.right === metrics.left ? 0 : (clientX - metrics.left) / (metrics.right - metrics.left);
      const rawStartMs = Math.round(metrics.visibleStartMs + ratio * metrics.visibleWindowMs);
      const thresholdMs = getSnapThresholdMs(metrics.visibleWindowMs, metrics.right - metrics.left);
      const snapTargets = buildSnapTargets(editor.segments, [], currentTimeMs);
      const snapTargetMs = snappingDisabled
        ? null
        : findNearestSnap([rawStartMs], snapTargets, thresholdMs);
      const startMs = Math.min(
        Math.max(0, snapTargetMs ?? rawStartMs),
        Math.max(0, metrics.durationMs - 1),
      );
      const endMs = Math.min(startMs + 3000, metrics.durationMs);

      return {
        segment:
          endMs > startMs
            ? { lineId, startMs, endMs }
            : { lineId, startMs: Math.max(0, metrics.durationMs - 1), endMs: metrics.durationMs },
        snapTargetMs,
      };
    },
    [currentTimeMs, editor],
  );

  const updatePlacementDragPosition = useCallback(
    (clientX: number, clientY: number, snappingDisabled: boolean) => {
      const preview = linePlacementPreviewRef.current;
      if (!preview) return;

      const hasDragged =
        preview.hasDragged ||
        Math.hypot(clientX - preview.startClientX, clientY - preview.startClientY) >= 4;

      if (!hasDragged) return;

      const { segment, snapTargetMs } = buildPlacementSegment(
        preview.lineId,
        clientX,
        clientY,
        snappingDisabled,
      );

      updatePlacementPreviewState({
        ...preview,
        clientX,
        clientY,
        hasDragged: true,
        segment,
        snapTargetMs,
      });
    },
    [buildPlacementSegment, updatePlacementPreviewState],
  );

  const handlePlacementPointerMove = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== linePlacementPreviewRef.current?.pointerId) return;
      updatePlacementDragPosition(event.clientX, event.clientY, event.altKey);
    },
    [updatePlacementDragPosition],
  );

  const handlePlacementPointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== linePlacementPreviewRef.current?.pointerId) return;
      updatePlacementDragPosition(event.clientX, event.clientY, event.altKey);
      finishPlacementDragRef.current();
    },
    [updatePlacementDragPosition],
  );

  const handlePlacementPointerCancel = useCallback((event: PointerEvent) => {
    if (event.pointerId !== linePlacementPreviewRef.current?.pointerId) return;
    cancelPlacementDragRef.current();
  }, []);

  const handlePlacementWindowBlur = useCallback(() => {
    cancelPlacementDragRef.current();
  }, []);

  const handlePlacementEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') cancelPlacementDragRef.current();
  }, []);

  const detachPlacementListeners = useCallback(() => {
    if (!placementListenersAttachedRef.current) return;
    window.removeEventListener('pointermove', handlePlacementPointerMove);
    window.removeEventListener('pointerup', handlePlacementPointerUp);
    window.removeEventListener('pointercancel', handlePlacementPointerCancel);
    window.removeEventListener('blur', handlePlacementWindowBlur);
    window.removeEventListener('keydown', handlePlacementEscape);
    placementListenersAttachedRef.current = false;
  }, [
    handlePlacementEscape,
    handlePlacementPointerCancel,
    handlePlacementPointerMove,
    handlePlacementPointerUp,
    handlePlacementWindowBlur,
  ]);

  const cancelPlacementDrag = useCallback(() => {
    detachPlacementListeners();
    clearPlacementPreview();
  }, [clearPlacementPreview, detachPlacementListeners]);

  useEffect(() => {
    cancelPlacementDragRef.current = cancelPlacementDrag;
  }, [cancelPlacementDrag]);

  const finishPlacementDrag = useCallback(() => {
    const preview = linePlacementPreviewRef.current;
    detachPlacementListeners();
    if (!preview) {
      clearPlacementPreview();
      return;
    }

    const finalSegment = preview.hasDragged ? preview.segment : null;
    clearPlacementPreview();
    if (!finalSegment) return;

    onPlaceSegment(finalSegment);
  }, [clearPlacementPreview, detachPlacementListeners, onPlaceSegment]);

  useEffect(() => {
    finishPlacementDragRef.current = finishPlacementDrag;
  }, [finishPlacementDrag]);

  const beginPlacementDrag = useCallback(
    (
      lineId: string,
      lineIndex: number,
      text: string,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      cancelPlacementDrag();
      updatePlacementPreviewState({
        pointerId,
        lineId,
        lineIndex,
        text,
        startClientX: clientX,
        startClientY: clientY,
        clientX,
        clientY,
        hasDragged: false,
        segment: null,
        snapTargetMs: null,
      });
      if (!placementListenersAttachedRef.current) {
        window.addEventListener('pointermove', handlePlacementPointerMove);
        window.addEventListener('pointerup', handlePlacementPointerUp);
        window.addEventListener('pointercancel', handlePlacementPointerCancel);
        window.addEventListener('blur', handlePlacementWindowBlur);
        window.addEventListener('keydown', handlePlacementEscape);
        placementListenersAttachedRef.current = true;
      }
    },
    [
      cancelPlacementDrag,
      handlePlacementEscape,
      handlePlacementPointerCancel,
      handlePlacementPointerMove,
      handlePlacementPointerUp,
      handlePlacementWindowBlur,
      updatePlacementPreviewState,
    ],
  );

  const handleTimelineLaneMetricsChange = useCallback((metrics: TimelineLaneMetrics) => {
    timelineLaneMetricsRef.current = metrics;
  }, []);

  useEffect(
    () => () => {
      detachPlacementListeners();
      clearPlacementPreview();
    },
    [clearPlacementPreview, detachPlacementListeners],
  );

  return {
    linePlacementPreview,
    beginPlacementDrag,
    cancelPlacementDrag,
    handleTimelineLaneMetricsChange,
  };
}
