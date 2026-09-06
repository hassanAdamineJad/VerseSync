import { useCallback, useReducer, useState } from 'react';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { LyricsPanel } from './components/LyricsPanel';
import { SegmentInspector } from './components/SegmentInspector';
import { TrackSetupScreen } from './components/TrackSetupScreen';
import {
  createEditorState,
  editorReducer,
  formatTime,
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
  const [isChangingTrack, setIsChangingTrack] = useState(false);

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
    onReplaceDocument: (document) => {
      dispatch({ type: 'replaceDocument', document });
      setIsChangingTrack(false);
    },
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
  const sourceLabel = editor?.document.source.kind === 'seeded' ? 'Seeded sample' : 'Local file';
  const addLine = useCallback((afterLineId: string | null, text: string) => {
    dispatch({ type: 'addLine', afterLineId, text });
  }, []);
  const editLineText = useCallback((lineId: string, text: string) => {
    dispatch({ type: 'editLineText', lineId, text });
  }, []);
  const deleteLine = useCallback((lineId: string) => {
    setDragPreviewSegments(null);
    cancelPlacementDrag();
    dispatch({ type: 'deleteLine', lineId });
  }, [cancelPlacementDrag]);
  const removeTiming = useCallback((lineId: string) => {
    setDragPreviewSegments(null);
    dispatch({ type: 'removeTiming', lineId });
  }, []);
  const closeTrackSetup = useCallback(() => {
    cancelReplacement();
    setIsChangingTrack(false);
  }, [cancelReplacement]);
  const openTrackSetup = useCallback(() => {
    resetWorkspacePreviews();
    setIsChangingTrack(true);
  }, [resetWorkspacePreviews]);

  if (!editor || isChangingTrack) {
    return (
      <div className="setup-app-shell">
        <audio ref={audioRef} preload="metadata" className="sr-only" />
        <TrackSetupScreen
          mode={editor ? 'replacement' : 'initial'}
          isLoading={sourceLoading}
          importError={importError}
          seededError={seededError}
          pendingTitle={pendingCandidateTitle}
          onImport={(file, lyrics) => void importTrack(file, lyrics)}
          onTrySample={() => void loadSeeded()}
          onConfirmReplacement={
            editor
              ? () => {
                  confirmReplacement();
                  setIsChangingTrack(false);
                }
              : undefined
          }
          onCancelReplacement={editor ? closeTrackSetup : undefined}
          onCancel={editor ? closeTrackSetup : undefined}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <audio ref={audioRef} preload="metadata" className="sr-only" />
      <div className="workspace-shell">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">V</span>
            <div className="brand-copy">
              <span className="brand-name">VerseSync</span>
              <p className="eyebrow">Lyric timing workspace</p>
            </div>
          </div>
          <div className="toolbar-track">
            <span className="source-badge">{sourceLabel}</span>
            <div>
              <strong>{editor.document.title}</strong>
              <small>Edits live in this browser session only</small>
            </div>
          </div>
          <div className="toolbar-actions">
            <div className="toolbar-transport">
              <div className="toolbar-transport-row">
                <button
                  type="button"
                  className="toolbar-playback-button"
                  onClick={() => void togglePlayback()}
                  disabled={!playback.isReady}
                >
                  {playback.isPlaying ? 'Pause' : 'Play'}
                  <kbd>Space</kbd>
                </button>
                <div className="toolbar-time">
                  <span>Playhead</span>
                  <strong>
                    {formatTime(playback.currentTimeMs)} / {formatTime(editor.document.durationMs)}
                  </strong>
                </div>
                <button type="button" className="toolbar-change-button" onClick={openTrackSetup}>
                  Change track
                </button>
              </div>
              <label className="toolbar-seek">
                <span className="sr-only">Seek through audio</span>
                <input
                  type="range"
                  min={0}
                  max={editor.document.durationMs}
                  step={1}
                  value={Math.min(playback.currentTimeMs, editor.document.durationMs)}
                  onChange={(event) => seek(Number(event.target.value))}
                  disabled={!playback.isReady}
                />
              </label>
              {playback.error ? (
                <p className="toolbar-playback-error" role="alert">
                  {playback.error}
                </p>
              ) : null}
            </div>
          </div>
        </header>

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

        <div className="editor-grid">
          <LyricsPanel
            editor={editor}
            playingLineId={playingLineId}
            activePlacementLineId={linePlacementPreview?.lineId ?? null}
            onSelect={(lineId: string) => dispatch({ type: 'select', lineId })}
            onInspect={(lineId: string) => dispatch({ type: 'inspect', lineId })}
            onAddLine={addLine}
            onEditLineText={editLineText}
            onDeleteLine={deleteLine}
            onStartPlacementDrag={beginPlacementDrag}
            onPlacementDragLostPointerCapture={(pointerId: number) => {
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
            onStamp={stamp}
            onFinish={finish}
          />
          <SegmentInspector
            editor={editor}
            dragPreviewSegments={dragPreviewSegments}
            onApply={(lineId: string, startMs: number, endMs: number) =>
              dispatch({ type: 'editSegment', lineId, startMs, endMs })
            }
            onRemoveTiming={removeTiming}
          />
        </div>
      </div>
    </div>
  );
}
