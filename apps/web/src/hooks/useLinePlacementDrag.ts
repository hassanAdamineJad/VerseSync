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
  sidebarInsertionIndex: number | null;
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
  onReorderLine: (lineId: string, toIndex: number) => void;
};

export function useLinePlacementDrag({
  editor,
  currentTimeMs,
  onPlaceSegment,
  onReorderLine,
}: Options) {
  const [linePlacementPreview, setLinePlacementPreview] = useState<LinePlacementPreview>(null);
  const linePlacementPreviewRef = useRef<LinePlacementPreview>(null);
  const timelineLaneMetricsRef = useRef<TimelineLaneMetrics>(null);
  const lyricsListRef = useRef<HTMLOListElement | null>(null);
  const latestPointerRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null);
  const placementListenersAttachedRef = useRef(false);
  const sidebarAutoScrollFrameRef = useRef<number | null>(null);
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

  const stopSidebarAutoScroll = useCallback(() => {
    if (sidebarAutoScrollFrameRef.current == null) return;
    window.cancelAnimationFrame(sidebarAutoScrollFrameRef.current);
    sidebarAutoScrollFrameRef.current = null;
  }, []);

  const getSidebarInsertionIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      const list = lyricsListRef.current;
      if (!list || !editor) return null;

      const listRect = list.getBoundingClientRect();
      const isInsideList =
        clientX >= listRect.left &&
        clientX <= listRect.right &&
        clientY >= listRect.top &&
        clientY <= listRect.bottom;
      if (!isInsideList) return null;

      const rowElements = Array.from(
        list.querySelectorAll<HTMLElement>('[data-lyric-row="true"]'),
      );
      if (rowElements.length === 0) return null;

      let insertionIndex = rowElements.length;
      for (let index = 0; index < rowElements.length; index += 1) {
        const row = rowElements[index];
        const rowRect = row.getBoundingClientRect();
        if (clientY < rowRect.top + rowRect.height / 2) {
          insertionIndex = index;
          break;
        }
      }

      return Math.min(Math.max(0, insertionIndex), editor.document.lines.length);
    },
    [editor],
  );

  const stepSidebarAutoScroll = useCallback(() => {
    const preview = linePlacementPreviewRef.current;
    const pointer = latestPointerRef.current;
    const list = lyricsListRef.current;
    if (!preview || !pointer || !list) {
      sidebarAutoScrollFrameRef.current = null;
      return;
    }

    const listRect = list.getBoundingClientRect();
    const isInsideHorizontalBounds =
      pointer.clientX >= listRect.left && pointer.clientX <= listRect.right;
    const thresholdPx = 32;
    let delta = 0;

    if (isInsideHorizontalBounds && pointer.clientY >= listRect.top && pointer.clientY <= listRect.bottom) {
      if (pointer.clientY < listRect.top + thresholdPx) {
        delta = -Math.max(8, ((listRect.top + thresholdPx - pointer.clientY) / thresholdPx) * 18);
      } else if (pointer.clientY > listRect.bottom - thresholdPx) {
        delta = Math.max(8, ((pointer.clientY - (listRect.bottom - thresholdPx)) / thresholdPx) * 18);
      }
    }

    if (delta === 0) {
      sidebarAutoScrollFrameRef.current = null;
      return;
    }

    const nextScrollTop = Math.min(
      Math.max(0, list.scrollTop + delta),
      Math.max(0, list.scrollHeight - list.clientHeight),
    );
    if (nextScrollTop !== list.scrollTop) {
      list.scrollTop = nextScrollTop;
      const refreshedPreview = linePlacementPreviewRef.current;
      if (refreshedPreview?.hasDragged) {
        updatePlacementPreviewState({
          ...refreshedPreview,
          sidebarInsertionIndex: getSidebarInsertionIndex(pointer.clientX, pointer.clientY),
        });
      }
    }

    sidebarAutoScrollFrameRef.current = window.requestAnimationFrame(stepSidebarAutoScroll);
  }, [getSidebarInsertionIndex, updatePlacementPreviewState]);

  const ensureSidebarAutoScroll = useCallback(() => {
    if (sidebarAutoScrollFrameRef.current != null) return;
    sidebarAutoScrollFrameRef.current = window.requestAnimationFrame(stepSidebarAutoScroll);
  }, [stepSidebarAutoScroll]);

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
      latestPointerRef.current = { clientX, clientY, altKey: snappingDisabled };

      const hasDragged =
        preview.hasDragged ||
        Math.hypot(clientX - preview.startClientX, clientY - preview.startClientY) >= 4;

      if (!hasDragged) {
        stopSidebarAutoScroll();
        return;
      }

      const canPlaceOnTimeline =
        editor != null &&
        editor.segments[preview.lineId] == null &&
        editor.openSegment?.lineId !== preview.lineId;
      const { segment, snapTargetMs } = canPlaceOnTimeline
        ? buildPlacementSegment(preview.lineId, clientX, clientY, snappingDisabled)
        : { segment: null, snapTargetMs: null };
      const sidebarInsertionIndex = getSidebarInsertionIndex(clientX, clientY);

      updatePlacementPreviewState({
        ...preview,
        clientX,
        clientY,
        hasDragged: true,
        segment,
        snapTargetMs,
        sidebarInsertionIndex,
      });
      if (sidebarInsertionIndex != null) ensureSidebarAutoScroll();
      else stopSidebarAutoScroll();
    },
    [
      buildPlacementSegment,
      editor,
      ensureSidebarAutoScroll,
      getSidebarInsertionIndex,
      stopSidebarAutoScroll,
      updatePlacementPreviewState,
    ],
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
    stopSidebarAutoScroll();
    latestPointerRef.current = null;
    lyricsListRef.current = null;
    clearPlacementPreview();
  }, [clearPlacementPreview, detachPlacementListeners, stopSidebarAutoScroll]);

  useEffect(() => {
    cancelPlacementDragRef.current = cancelPlacementDrag;
  }, [cancelPlacementDrag]);

  const finishPlacementDrag = useCallback(() => {
    const preview = linePlacementPreviewRef.current;
    detachPlacementListeners();
    stopSidebarAutoScroll();
    latestPointerRef.current = null;
    lyricsListRef.current = null;
    if (!preview) {
      clearPlacementPreview();
      return;
    }

    const finalSegment = preview.hasDragged ? preview.segment : null;
    const finalInsertionIndex = preview.hasDragged ? preview.sidebarInsertionIndex : null;
    clearPlacementPreview();
    if (finalSegment) {
      onPlaceSegment(finalSegment);
      return;
    }
    if (finalInsertionIndex == null || !editor) return;

    const fromIndex = editor.document.lines.findIndex((line) => line.id === preview.lineId);
    if (fromIndex < 0) return;
    const toIndex =
      finalInsertionIndex > fromIndex ? finalInsertionIndex - 1 : finalInsertionIndex;
    onReorderLine(
      preview.lineId,
      Math.min(Math.max(0, toIndex), Math.max(0, editor.document.lines.length - 1)),
    );
  }, [
    clearPlacementPreview,
    detachPlacementListeners,
    editor,
    onPlaceSegment,
    onReorderLine,
    stopSidebarAutoScroll,
  ]);

  useEffect(() => {
    finishPlacementDragRef.current = finishPlacementDrag;
  }, [finishPlacementDrag]);

  const beginPlacementDrag = useCallback(
    (
      lineId: string,
      lineIndex: number,
      text: string,
      lyricsListElement: HTMLOListElement | null,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      cancelPlacementDrag();
      lyricsListRef.current = lyricsListElement;
      latestPointerRef.current = { clientX, clientY, altKey: false };
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
        sidebarInsertionIndex: null,
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
    lineReorderInsertionIndex: linePlacementPreview?.hasDragged
      ? linePlacementPreview.sidebarInsertionIndex
      : null,
    beginPlacementDrag,
    cancelPlacementDrag,
    handleTimelineLaneMetricsChange,
  };
}
