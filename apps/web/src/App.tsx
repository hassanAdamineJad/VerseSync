import { useCallback, useRef, useReducer, useState } from 'react';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { PreviewModal } from './components/PreviewModal';
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
import { useWorkspaceKeyboardShortcuts } from './hooks/useWorkspaceKeyboardShortcuts';
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
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editorReveal, setEditorReveal] = useState<{
    lineId: string;
    centerMs: number;
    token: number;
  } | null>(null);
  const keyboardShortcutsTriggerRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
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
    setPlaybackRate,
    togglePlayback,
    seek,
  } = useAudioController(handleMediaEnded);

  const {
    linePlacementPreview,
    lineReorderInsertionIndex,
    lineMergeTargetLineId,
    beginPlacementDrag,
    cancelPlacementDrag,
    handleTimelineLaneMetricsChange,
  } = useLinePlacementDrag({
    editor,
    currentTimeMs: playback.currentTimeMs,
    selectedSegmentCount,
    onPlaceSegment: (segment) => {
      dispatch({
        type: 'placeSegment',
        lineId: segment.lineId,
        startMs: segment.startMs,
        endMs: segment.endMs,
      });
    },
    onReorderLine: (lineId, toIndex) => {
      setDragPreviewSegments(null);
      dispatch({ type: 'reorderLine', lineId, toIndex });
    },
    onMergeWithNext: (lineId) => {
      setDragPreviewSegments(null);
      dispatch({ type: 'mergeLineWithNext', lineId });
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
      setIsPreviewOpen(false);
    },
    onBeforeSourceSwap: resetWorkspacePreviews,
  });

  const handleTogglePlayback = useCallback(() => {
    void togglePlayback();
  }, [togglePlayback]);

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

  const openKeyboardShortcuts = useCallback(() => {
    setIsKeyboardShortcutsOpen(true);
  }, []);

  const closeKeyboardShortcuts = useCallback(() => {
    setIsKeyboardShortcutsOpen(false);
    window.requestAnimationFrame(() => {
      keyboardShortcutsTriggerRef.current?.focus();
    });
  }, []);

  const openPreview = useCallback(() => {
    setIsKeyboardShortcutsOpen(false);
    setIsPreviewOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setIsPreviewOpen(false);
    window.requestAnimationFrame(() => {
      previewTriggerRef.current?.focus();
    });
  }, []);

  const editTimingFromPreview = useCallback(
    (lineId: string) => {
      if (!editor) return;
      const segment = editor.segments[lineId];
      dispatch({ type: 'inspect', lineId });
      if (segment) {
        seek(segment.startMs);
        setEditorReveal({
          lineId,
          centerMs: Math.round((segment.startMs + segment.endMs) / 2),
          token: Date.now(),
        });
      }
      setIsPreviewOpen(false);
    },
    [editor, seek],
  );

  useWorkspaceKeyboardShortcuts({
    transportEnabled: editor != null && !isChangingTrack,
    canStamp: editor != null && (editor.openSegment != null || editor.captureCursorLineId != null),
    canFinish: editor?.openSegment != null,
    onTogglePlayback: handleTogglePlayback,
    onStamp: stamp,
    onFinish: finish,
    onUndo: undo,
    onRedo: redo,
    onOpenHelp: openKeyboardShortcuts,
  });

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
  const reorderLine = useCallback((lineId: string, toIndex: number) => {
    resetWorkspacePreviews();
    dispatch({ type: 'reorderLine', lineId, toIndex });
  }, [resetWorkspacePreviews]);
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
    setIsPreviewOpen(false);
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
          keyboardShortcutsButtonRef={keyboardShortcutsTriggerRef}
          previewButtonRef={previewTriggerRef}
          trackTitle={editor.document.title}
          sourceLabel={sourceLabel}
          currentTimeMs={playback.currentTimeMs}
          durationMs={editor.document.durationMs}
          isPlaying={playback.isPlaying}
          isPlaybackReady={playback.isReady}
          playbackError={playback.error}
          playbackRate={playback.playbackRate}
          previewDisabled={completedSegmentCount === 0}
          exportDisabled={completedSegmentCount === 0}
          undoDisabled={!canUndo}
          redoDisabled={!canRedo}
          onTogglePlayback={handleTogglePlayback}
          onPlaybackRateChange={setPlaybackRate}
          onUndo={undo}
          onRedo={redo}
          onOpenKeyboardShortcuts={openKeyboardShortcuts}
          onOpenPreview={openPreview}
          onExportLrc={exportLrc}
          onChangeTrack={openTrackSetup}
        />

        {isKeyboardShortcutsOpen ? (
          <KeyboardShortcutsModal onClose={closeKeyboardShortcuts} />
        ) : null}

        {isPreviewOpen ? (
          <PreviewModal
            editor={editor}
            currentTimeMs={playback.currentTimeMs}
            isPlaying={playback.isPlaying}
            isPlaybackReady={playback.isReady}
            readCurrentTimeMs={readCurrentTimeMs}
            onTogglePlayback={handleTogglePlayback}
            onSeek={seek}
            onEditTiming={editTimingFromPreview}
            onClose={closePreview}
          />
        ) : null}

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
            lineReorderInsertionIndex={lineReorderInsertionIndex}
            lineMergeTargetLineId={lineMergeTargetLineId}
            onSelect={(lineId: string) => dispatch({ type: 'select', lineId })}
            onInspect={(lineId: string) => dispatch({ type: 'inspect', lineId })}
            revealLineRequest={editorReveal}
            onAddLine={addLine}
            onEditLineText={editLineText}
            onReorderLine={reorderLine}
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
            onSeek={seek}
            onStamp={stamp}
            onFinish={finish}
            viewportCenterRequest={editorReveal}
          />
          <SegmentInspector
            editor={editor}
            dragPreviewSegments={dragPreviewSegments}
            selectedSegmentCount={selectedSegmentCount}
            currentTimeMs={playback.currentTimeMs}
            revealLineRequest={editorReveal}
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
