import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, getSeededTrack } from './api';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { ImportPanel } from './components/ImportPanel';
import { LyricsPanel } from './components/LyricsPanel';
import { SegmentInspector } from './components/SegmentInspector';
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
  lineId: string;
  text: string;
  clientX: number;
  clientY: number;
  segment: CompletedSegment | null;
} | null;
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
  const [sourceLoading, setSourceLoading] = useState<'seeded' | 'local' | null>('seeded');
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null);
  const [dragPreviewSegments, setDragPreviewSegments] = useState<DragPreview>(null);
  const [linePlacementPreview, setLinePlacementPreview] = useState<LinePlacementPreview>(null);
  const timelineLaneMetricsRef = useRef<TimelineLaneMetrics>(null);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
    setLinePlacementPreview(null);
    return attemptRef.current;
  }, [cancelPreparedSource]);

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

  useEffect(() => {
    void loadSeeded();
    return () => {
      attemptRef.current += 1;
      fetchAbortRef.current?.abort();
      cancelPreparedSource();
    };
  }, [cancelPreparedSource, loadSeeded]);

  const handleImport = useCallback(
    async (file: File, lyrics: string) => {
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
    setLinePlacementPreview(null);
  }, [commitSource, pendingCandidate]);

  const cancelReplacement = useCallback(() => {
    cancelPreparedSource();
    setPendingCandidate(null);
    setDragPreviewSegments(null);
    setLinePlacementPreview(null);
  }, [cancelPreparedSource]);

  const updateLinePlacementPreview = useCallback(
    (lineId: string, text: string, clientX: number, clientY: number) => {
      const metrics = timelineLaneMetricsRef.current;
      if (!metrics) {
        setLinePlacementPreview({ lineId, text, clientX, clientY, segment: null });
        return;
      }

      const isInsideLane =
        clientX >= metrics.left &&
        clientX <= metrics.right &&
        clientY >= metrics.top &&
        clientY <= metrics.bottom;

      if (!isInsideLane) {
        setLinePlacementPreview({ lineId, text, clientX, clientY, segment: null });
        return;
      }

      const ratio =
        metrics.right === metrics.left
          ? 0
          : (clientX - metrics.left) / (metrics.right - metrics.left);
      const rawStartMs = Math.round(
        metrics.visibleStartMs + ratio * metrics.visibleWindowMs,
      );
      const startMs = Math.min(Math.max(0, rawStartMs), Math.max(0, metrics.durationMs - 1));
      const endMs = Math.min(startMs + 3000, metrics.durationMs);
      const segment =
        endMs > startMs
          ? { lineId, startMs, endMs }
          : { lineId, startMs: Math.max(0, metrics.durationMs - 1), endMs: metrics.durationMs };

      setLinePlacementPreview({ lineId, text, clientX, clientY, segment });
    },
    [],
  );

  const commitLinePlacement = useCallback(() => {
    setLinePlacementPreview((current) => {
      if (!current?.segment) return null;
      dispatch({
        type: 'placeSegment',
        lineId: current.segment.lineId,
        startMs: current.segment.startMs,
        endMs: current.segment.endMs,
      });
      return null;
    });
  }, []);

  const stamp = useCallback(() => {
    dispatch({ type: 'stamp', atMs: readCurrentTimeMs() });
  }, [readCurrentTimeMs]);

  const finish = useCallback(() => {
    dispatch({ type: 'finish', atMs: readCurrentTimeMs() });
  }, [readCurrentTimeMs]);

  const playingLineId = editor
    ? getPlayingLineId(editor, playback.currentTimeMs)
    : null;

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

      {linePlacementPreview ? (
        <div
          className="line-placement-ghost"
          style={{
            left: linePlacementPreview.clientX + 12,
            top: linePlacementPreview.clientY + 12,
          }}
        >
          {linePlacementPreview.text}
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

      {editor ? (
        <div className="editor-grid">
          <LyricsPanel
            editor={editor}
            playingLineId={playingLineId}
            onSelect={(lineId) => dispatch({ type: 'select', lineId })}
            onPlacementDragMove={updateLinePlacementPreview}
            onPlacementDragEnd={commitLinePlacement}
            onPlacementDragCancel={() => setLinePlacementPreview(null)}
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
      ) : (
        <section className="empty-state" aria-live="polite">
          <p>{sourceLoading === 'seeded' ? 'Loading the seeded track…' : 'Load audio and lyrics to begin.'}</p>
        </section>
      )}
    </div>
  );
}
