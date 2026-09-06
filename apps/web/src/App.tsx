import { useCallback, useReducer, useState } from 'react';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { ImportPanel } from './components/ImportPanel';
import { LyricsPanel } from './components/LyricsPanel';
import { SegmentInspector } from './components/SegmentInspector';
import { TrackSetupScreen } from './components/TrackSetupScreen';
import {
  createEditorState,
  editorReducer,
  getPlayingLineId,
  type CompletedSegment,
  type EditorAction,
  type EditorDocument,
  type EditorState,
} from './editor';
import { useLinePlacementDrag } from './hooks/useLinePlacementDrag';
import { useTrackSourceFlow } from './hooks/useTrackSourceFlow';
import {
  useAudioController,
} from './hooks/useAudioController';

type SessionAction = EditorAction | { type: 'replaceDocument'; document: EditorDocument };

function sessionReducer(state: EditorState | null, action: SessionAction): EditorState | null {
  if (action.type === 'replaceDocument') return createEditorState(action.document);
  return state ? editorReducer(state, action) : state;
}

export default function App() {
  const [editor, dispatch] = useReducer(sessionReducer, null);
  const [dragPreviewSegments, setDragPreviewSegments] = useState<CompletedSegment[] | null>(null);

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

  const {
    linePlacementPreview,
    beginPlacementDrag,
    cancelPlacementDrag,
    handleTimelineLaneMetricsChange,
  } = useLinePlacementDrag({
    editor,
    currentTimeMs: playback.currentTimeMs,
    onPlaceSegment: (segment) => {
      dispatch({
        type: 'placeSegment',
        lineId: segment.lineId,
        startMs: segment.startMs,
        endMs: segment.endMs,
      });
    },
  });

  const resetWorkspacePreviews = useCallback(() => {
    setDragPreviewSegments(null);
    cancelPlacementDrag();
  }, [cancelPlacementDrag]);

  const {
    seededError,
    importError,
    sourceLoading,
    pendingCandidateTitle,
    loadSeeded,
    importTrack,
    confirmReplacement,
    cancelReplacement,
  } = useTrackSourceFlow({
    editor,
    prepareSource,
    commitSource,
    cancelPreparedSource,
    onReplaceDocument: (document) => dispatch({ type: 'replaceDocument', document }),
    onBeforeSourceSwap: resetWorkspacePreviews,
  });

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
          onImport={(file, lyrics) => void importTrack(file, lyrics)}
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
        pendingTitle={pendingCandidateTitle}
        onImport={(file, lyrics) => void importTrack(file, lyrics)}
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
            if (linePlacementPreview?.pointerId === pointerId) {
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
          onTimelineLaneMetricsChange={handleTimelineLaneMetricsChange}
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
