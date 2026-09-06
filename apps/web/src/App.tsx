import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, getSeededTrack } from './api';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { ImportPanel } from './components/ImportPanel';
import { LyricsPanel } from './components/LyricsPanel';
import { SegmentInspector } from './components/SegmentInspector';
import { TrackSetupScreen } from './components/TrackSetupScreen';
import {
  createEditorState,
  editorReducer,
  getPlayingLineId,
  normalizeLocalTrack,
  normalizeSeededTrack,
  parsePastedLyrics,
  type CompletedSegment,
  type EditorAction,
  type EditorDocument,
  type EditorState,
} from './editor';
import { buildSnapTargets, findNearestSnap, getSnapThresholdMs } from './timelineSnapping';
import {
  useAudioController,
  type PreparedAudioSource,
} from './useAudioController';

type SessionAction = EditorAction | { type: 'replaceDocument'; document: EditorDocument };

type PendingCandidate = {
  document: EditorDocument;
  audio: PreparedAudioSource;
};

type DragPreview = CompletedSegment[] | null;
type LinePlacementPreview = {
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
type PlacementComputation = {
  segment: CompletedSegment | null;
  snapTargetMs: number | null;
};
type TimelineLaneMetrics = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  visibleStartMs: number;
  visibleWindowMs: number;
  durationMs: number;
} | null;

function sessionReducer(state: EditorState | null, action: SessionAction): EditorState | null {
  if (action.type === 'replaceDocument') return createEditorState(action.document);
  return state ? editorReducer(state, action) : state;
}

function sourceError(error: unknown): string {
  if (error instanceof ApiError) {
    return `The seeded track could not be loaded (${error.status}). You can retry or load a local file.`;
  }
  if (error instanceof Error) return error.message;
  return 'The source could not be loaded.';
}

export default function App() {
  const [editor, dispatch] = useReducer(sessionReducer, null);
  const editorRef = useRef(editor);
  const attemptRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const [seededError, setSeededError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState<'seeded' | 'local' | null>(null);
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null);
  const [dragPreviewSegments, setDragPreviewSegments] = useState<DragPreview>(null);
  const [linePlacementPreview, setLinePlacementPreview] = useState<LinePlacementPreview>(null);
  const linePlacementPreviewRef = useRef<LinePlacementPreview>(null);
  const timelineLaneMetricsRef = useRef<TimelineLaneMetrics>(null);
  const placementListenersAttachedRef = useRef(false);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const updatePlacementPreviewState = useCallback((next: LinePlacementPreview) => {
    linePlacementPreviewRef.current = next;
    setLinePlacementPreview(next);
  }, []);

  const clearPlacementPreview = useCallback(() => {
    linePlacementPreviewRef.current = null;
    setLinePlacementPreview(null);
  }, []);

  const handleMediaEnded = useCallback((durationMs: number) => {
    dispatch({ type: 'mediaEnded', durationMs });
  }, []);

  const {
    audioRef,
    playback,
    prepareSource,
    commitSource,
    cancelPreparedSource,
    readCurrentTimeMs,
    togglePlayback,
    seek,
  } = useAudioController(handleMediaEnded);

  const beginAttempt = useCallback(() => {
    attemptRef.current += 1;
    fetchAbortRef.current?.abort();
    cancelPreparedSource();
    setPendingCandidate(null);
    setDragPreviewSegments(null);
    clearPlacementPreview();
    return attemptRef.current;
  }, [cancelPreparedSource, clearPlacementPreview]);

  const offerCandidate = useCallback(
    (document: EditorDocument, audio: PreparedAudioSource) => {
      const current = editorRef.current;
      const needsConfirmation =
        current != null && (current.dirty || current.document.source.kind === 'local');

      if (needsConfirmation) {
        setPendingCandidate({ document, audio });
        return;
      }
      if (commitSource(audio)) dispatch({ type: 'replaceDocument', document });
    },
    [commitSource],
  );

  const loadSeeded = useCallback(async () => {
    const attempt = beginAttempt();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setSeededError(null);
    setSourceLoading('seeded');

    try {
      const track = await getSeededTrack(controller.signal);
      if (attempt !== attemptRef.current) return;
      const prepared = await prepareSource({ kind: 'seeded', url: track.audio_url });
      if (attempt !== attemptRef.current) return;
      offerCandidate(normalizeSeededTrack(track, prepared.durationMs), prepared);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        attempt !== attemptRef.current
      ) {
        return;
      }
      setSeededError(sourceError(error));
    } finally {
      if (attempt === attemptRef.current) setSourceLoading(null);
    }
  }, [beginAttempt, offerCandidate, prepareSource]);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      fetchAbortRef.current?.abort();
      cancelPreparedSource();
    },
    [cancelPreparedSource],
  );

  const handleImport = useCallback(
    async (file: File, lyrics: string) => {
      setSeededError(null);
      setImportError(null);
      const parsed = parsePastedLyrics(lyrics);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }

      const attempt = beginAttempt();
      setSourceLoading('local');
      try {
        const prepared = await prepareSource({ kind: 'local', file });
        if (attempt !== attemptRef.current) return;
        offerCandidate(
          normalizeLocalTrack(file.name, prepared.url, prepared.durationMs, parsed.lines),
          prepared,
        );
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === 'AbortError') ||
          attempt !== attemptRef.current
        ) {
          return;
        }
        setImportError(
          `${sourceError(error)} Choose a browser-supported audio file and try again.`,
        );
      } finally {
        if (attempt === attemptRef.current) setSourceLoading(null);
      }
    },
    [beginAttempt, offerCandidate, prepareSource],
  );

  const confirmReplacement = useCallback(() => {
    if (!pendingCandidate) return;
    if (commitSource(pendingCandidate.audio)) {
      dispatch({ type: 'replaceDocument', document: pendingCandidate.document });
    }
    setPendingCandidate(null);
    setDragPreviewSegments(null);
    clearPlacementPreview();
  }, [clearPlacementPreview, commitSource, pendingCandidate]);

  const cancelReplacement = useCallback(() => {
    cancelPreparedSource();
    setPendingCandidate(null);
    setDragPreviewSegments(null);
    clearPlacementPreview();
  }, [cancelPreparedSource, clearPlacementPreview]);

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
        metrics.right === metrics.left
          ? 0
          : (clientX - metrics.left) / (metrics.right - metrics.left);
      const rawStartMs = Math.round(
        metrics.visibleStartMs + ratio * metrics.visibleWindowMs,
      );
      const thresholdMs = getSnapThresholdMs(
        metrics.visibleWindowMs,
        metrics.right - metrics.left,
      );
      const snapTargets = buildSnapTargets(editor.segments, [], playback.currentTimeMs);
      const snapTargetMs =
        snappingDisabled
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
    [editor, playback.currentTimeMs],
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

  const detachPlacementListeners = useCallback(() => {
    if (!placementListenersAttachedRef.current) return;
    window.removeEventListener('pointermove', handlePlacementPointerMove);
    window.removeEventListener('pointerup', handlePlacementPointerUp);
    window.removeEventListener('pointercancel', handlePlacementPointerCancel);
    window.removeEventListener('blur', handlePlacementWindowBlur);
    window.removeEventListener('keydown', handlePlacementEscape);
    placementListenersAttachedRef.current = false;
  }, []);

  const cancelPlacementDrag = useCallback(() => {
    detachPlacementListeners();
    clearPlacementPreview();
  }, [clearPlacementPreview, detachPlacementListeners]);

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

    dispatch({
      type: 'placeSegment',
      lineId: finalSegment.lineId,
      startMs: finalSegment.startMs,
      endMs: finalSegment.endMs,
    });
  }, [clearPlacementPreview, detachPlacementListeners]);

  const handlePlacementPointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== linePlacementPreviewRef.current?.pointerId) return;
      updatePlacementDragPosition(event.clientX, event.clientY, event.altKey);
      finishPlacementDrag();
    },
    [finishPlacementDrag, updatePlacementDragPosition],
  );

  const handlePlacementPointerCancel = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== linePlacementPreviewRef.current?.pointerId) return;
      cancelPlacementDrag();
    },
    [cancelPlacementDrag],
  );

  const handlePlacementWindowBlur = useCallback(() => {
    cancelPlacementDrag();
  }, [cancelPlacementDrag]);

  const handlePlacementEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelPlacementDrag();
    },
    [cancelPlacementDrag],
  );

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

  useEffect(
    () => () => {
      detachPlacementListeners();
      clearPlacementPreview();
    },
    [clearPlacementPreview, detachPlacementListeners],
  );

  const stamp = useCallback(() => {
    dispatch({ type: 'stamp', atMs: readCurrentTimeMs() });
  }, [readCurrentTimeMs]);

  const finish = useCallback(() => {
    dispatch({ type: 'finish', atMs: readCurrentTimeMs() });
  }, [readCurrentTimeMs]);

  const playingLineId = editor
    ? getPlayingLineId(editor, playback.currentTimeMs)
    : null;

  if (!editor) {
    return (
      <div className="setup-app-shell">
        <audio ref={audioRef} preload="metadata" className="sr-only" />
        <TrackSetupScreen
          isLoading={sourceLoading}
          importError={importError}
          seededError={seededError}
          onImport={(file, lyrics) => void handleImport(file, lyrics)}
          onTrySample={() => void loadSeeded()}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <audio ref={audioRef} preload="metadata" className="sr-only" />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div>
            <p className="eyebrow">Lyric timing workspace</p>
            <span className="brand-name">VerseSync</span>
          </div>
        </div>
        <div className="header-source">
          <div>
            <span>{editor?.document.title ?? 'No active track'}</span>
            <small>Edits live in this browser session only</small>
          </div>
          <button type="button" onClick={() => void loadSeeded()} disabled={sourceLoading != null}>
            {sourceLoading === 'seeded' ? 'Loading seeded…' : 'Load seeded track'}
          </button>
        </div>
      </header>

      {seededError && (
        <div className="source-alert" role="alert">
          <p>{seededError}</p>
          <button type="button" onClick={() => void loadSeeded()}>
            Retry seeded track
          </button>
        </div>
      )}

      {linePlacementPreview?.hasDragged ? (
        <div
          className="line-placement-ghost"
          style={{
            left: linePlacementPreview.clientX + 12,
            top: linePlacementPreview.clientY + 12,
          }}
        >
          <span className="line-placement-ghost-index">
            {String(
              (editor?.document.lines.find((line) => line.id === linePlacementPreview.lineId)?.index ?? 0) + 1,
            ).padStart(2, '0')}
          </span>
          <span className="line-placement-ghost-text">{linePlacementPreview.text}</span>
        </div>
      ) : null}

      <ImportPanel
        isLoading={sourceLoading === 'local'}
        error={importError}
        pendingTitle={pendingCandidate?.document.title ?? null}
        onImport={(file, lyrics) => void handleImport(file, lyrics)}
        onConfirmReplacement={confirmReplacement}
        onCancelReplacement={cancelReplacement}
      />

      <div className="editor-grid">
        <LyricsPanel
          editor={editor}
          playingLineId={playingLineId}
          activePlacementLineId={linePlacementPreview?.lineId ?? null}
          onSelect={(lineId) => dispatch({ type: 'select', lineId })}
          onStartPlacementDrag={beginPlacementDrag}
          onPlacementDragLostPointerCapture={(pointerId) => {
            if (linePlacementPreviewRef.current?.pointerId === pointerId) {
              cancelPlacementDrag();
            }
          }}
        />
        <CaptureWorkspace
          editor={editor}
          dragPreviewSegments={dragPreviewSegments}
          linePlacementPreview={linePlacementPreview}
          currentTimeMs={playback.currentTimeMs}
          isPlaying={playback.isPlaying}
          isReady={playback.isReady}
          playbackError={playback.error}
          onSelectSegment={(lineId: string) => dispatch({ type: 'inspect', lineId })}
          onPreviewSegmentDrag={(segments: CompletedSegment[]) =>
            setDragPreviewSegments(segments)
          }
          onCommitSegmentDrag={(segments: CompletedSegment[]) => {
            setDragPreviewSegments(null);
            dispatch({ type: 'editSegments', segments });
          }}
          onCancelSegmentDrag={() => setDragPreviewSegments(null)}
          onTimelineLaneMetricsChange={(metrics) => {
            timelineLaneMetricsRef.current = metrics;
          }}
          onTogglePlayback={() => void togglePlayback()}
          onSeek={seek}
          onStamp={stamp}
          onFinish={finish}
        />
        <SegmentInspector
          editor={editor}
          dragPreviewSegments={dragPreviewSegments}
          onApply={(lineId, startMs, endMs) =>
            dispatch({ type: 'editSegment', lineId, startMs, endMs })
          }
        />
      </div>
    </div>
  );
}
