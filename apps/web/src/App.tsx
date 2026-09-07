import { useCallback, useEffect, useReducer, useState } from 'react';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { LinePlacementGhost } from './components/LinePlacementGhost';
import { LyricsPanel } from './components/LyricsPanel';
import { SegmentInspector } from './components/SegmentInspector';
import { TrackSetupScreen } from './components/TrackSetupScreen';
import { WorkspaceHeader } from './components/WorkspaceHeader';
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
import { downloadLrc } from './lrc';
import { useTrackSourceFlow } from './hooks/useTrackSourceFlow';
import {
  useAudioController,
} from './hooks/useAudioController';

type EditorHistoryState = {
  past: EditorState[];
  present: EditorState | null;
  future: EditorState[];
};

type SessionAction =
  | EditorAction
  | { type: 'replaceDocument'; document: EditorDocument }
  | { type: 'undo' }
  | { type: 'redo' };

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') != null
  );
}

function isHistoryTrackedAction(action: EditorAction): boolean {
  return action.type !== 'select' && action.type !== 'inspect' && action.type !== 'clearMessage';
}

function didAuthoredEditorStateChange(previous: EditorState, next: EditorState): boolean {
  return (
    previous.document !== next.document ||
    previous.segments !== next.segments ||
    previous.openSegment !== next.openSegment ||
    previous.selectedLineId !== next.selectedLineId ||
    previous.captureCursorLineId !== next.captureCursorLineId ||
    previous.dirty !== next.dirty
  );
}

function sessionReducer(state: EditorHistoryState, action: SessionAction): EditorHistoryState {
  if (action.type === 'replaceDocument') {
    return {
      past: [],
      present: createEditorState(action.document),
      future: [],
    };
  }

  if (action.type === 'undo') {
    if (!state.present || state.past.length === 0) return state;

    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }

  if (action.type === 'redo') {
    if (!state.present || state.future.length === 0) return state;

    const [nextPresent, ...remainingFuture] = state.future;
    return {
      past: [...state.past, state.present],
      present: nextPresent,
      future: remainingFuture,
    };
  }

  if (!state.present) return state;

  const nextPresent = editorReducer(state.present, action);
  if (nextPresent === state.present) return state;

  if (!isHistoryTrackedAction(action) || !didAuthoredEditorStateChange(state.present, nextPresent)) {
    return {
      ...state,
      present: nextPresent,
    };
  }

  return {
    past: [...state.past, state.present],
    present: nextPresent,
    future: [],
  };
}

export default function App() {
  const [history, dispatch] = useReducer(sessionReducer, {
    past: [],
    present: null,
    future: [],
  });
  const [dragPreviewSegments, setDragPreviewSegments] = useState<CompletedSegment[] | null>(null);
  const [selectedSegmentCount, setSelectedSegmentCount] = useState(0);
  const [isChangingTrack, setIsChangingTrack] = useState(false);
  const editor = history.present;

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

  const canUndo = editor != null && history.past.length > 0;
  const canRedo = editor != null && history.future.length > 0;

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

  const undo = useCallback(() => {
    if (!canUndo) return;
    resetWorkspacePreviews();
    dispatch({ type: 'undo' });
  }, [canUndo, resetWorkspacePreviews]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    resetWorkspacePreviews();
    dispatch({ type: 'redo' });
  }, [canRedo, resetWorkspacePreviews]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const canUsePrimaryShortcut = event.metaKey || event.ctrlKey;
      if (!canUsePrimaryShortcut) return;

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  const playingLineId = editor
    ? getPlayingLineId(editor, playback.currentTimeMs)
    : null;
  const completedSegmentCount = editor ? Object.keys(editor.segments).length : 0;
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
  const mergeLineWithNext = useCallback((lineId: string) => {
    resetWorkspacePreviews();
    dispatch({ type: 'mergeLineWithNext', lineId });
  }, [resetWorkspacePreviews]);
  const splitLine = useCallback(
    (
      lineId: string,
      newLineId: string,
      firstText: string,
      secondText: string,
      splitMs: number,
    ) => {
      resetWorkspacePreviews();
      dispatch({
        type: 'splitLine',
        lineId,
        newLineId,
        firstText,
        secondText,
        splitMs,
      });
    },
    [resetWorkspacePreviews],
  );
  const closeTrackSetup = useCallback(() => {
    cancelReplacement();
    setIsChangingTrack(false);
  }, [cancelReplacement]);
  const openTrackSetup = useCallback(() => {
    resetWorkspacePreviews();
    setIsChangingTrack(true);
  }, [resetWorkspacePreviews]);
  const exportLrc = useCallback(() => {
    if (!editor) return;
    downloadLrc(editor);
  }, [editor]);

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
        <WorkspaceHeader
          trackTitle={editor.document.title}
          sourceLabel={sourceLabel}
          currentTimeMs={playback.currentTimeMs}
          durationMs={editor.document.durationMs}
          isPlaying={playback.isPlaying}
          isPlaybackReady={playback.isReady}
          playbackError={playback.error}
          exportDisabled={completedSegmentCount === 0}
          undoDisabled={!canUndo}
          redoDisabled={!canRedo}
          onTogglePlayback={() => void togglePlayback()}
          onSeek={seek}
          onUndo={undo}
          onRedo={redo}
          onExportLrc={exportLrc}
          onChangeTrack={openTrackSetup}
        />

        {linePlacementPreview?.hasDragged ? (
          <LinePlacementGhost
            lineNumber={String(
              (editor.document.lines.find((line) => line.id === linePlacementPreview.lineId)?.index ?? 0) + 1,
            ).padStart(2, '0')}
            text={linePlacementPreview.text}
            left={linePlacementPreview.clientX + 12}
            top={linePlacementPreview.clientY + 12}
          />
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
            onSelectedSegmentCountChange={setSelectedSegmentCount}
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
            selectedSegmentCount={selectedSegmentCount}
            currentTimeMs={playback.currentTimeMs}
            onApply={(lineId: string, startMs: number, endMs: number) =>
              dispatch({ type: 'editSegment', lineId, startMs, endMs })
            }
            onRemoveTiming={removeTiming}
            onMergeWithNext={mergeLineWithNext}
            onSplitLine={splitLine}
          />
        </div>
      </div>
    </div>
  );
}
