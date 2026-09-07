import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { formatTime, type EditorState } from '../editor';

type Props = {
  editor: EditorState;
  playingLineId: string | null;
  activePlacementLineId: string | null;
  lineReorderInsertionIndex: number | null;
  lineMergeTargetLineId: string | null;
  onSelect: (lineId: string) => void;
  onInspect: (lineId: string) => void;
  onAddLine: (afterLineId: string | null, text: string) => void;
  onEditLineText: (lineId: string, text: string) => void;
  onReorderLine: (lineId: string, toIndex: number) => void;
  onDeleteLine: (lineId: string) => void;
  onStartPlacementDrag: (
    lineId: string,
    lineIndex: number,
    text: string,
    lyricsListElement: HTMLOListElement | null,
    pointerId: number,
    clientX: number,
    clientY: number,
  ) => void;
  onPlacementDragLostPointerCapture: (pointerId: number) => void;
};

type AddPanelState = { value: string; error: string | null } | null;
type EditState = {
  lineId: string;
  initialValue: string;
  value: string;
  error: string | null;
} | null;
type ConfirmDeleteState = { lineId: string; text: string } | null;

function getTrimmedTextError(value: string, verb: 'add' | 'save') {
  return value.trim()
    ? null
    : verb === 'add'
      ? 'Enter lyric text before adding a line.'
      : 'Enter lyric text before saving this line.';
}

export function LyricsPanel({
  editor,
  playingLineId,
  activePlacementLineId,
  lineReorderInsertionIndex,
  lineMergeTargetLineId,
  onSelect,
  onInspect,
  onAddLine,
  onEditLineText,
  onReorderLine,
  onDeleteLine,
  onStartPlacementDrag,
  onPlacementDragLostPointerCapture,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const rowContainerRefs = useRef(new Map<string, HTMLDivElement>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const suppressNextBlurSaveRef = useRef(false);
  const focusSelectedRowAfterRenderRef = useRef(false);
  const previousCaptureTargetRef = useRef<string | null>(null);
  const completedCount = Object.keys(editor.segments).length;
  const activeCaptureLineId = editor.openSegment?.lineId ?? null;
  const captureTargetLineId = activeCaptureLineId ?? editor.captureCursorLineId ?? null;
  const captureTargetKey = activeCaptureLineId
    ? `active:${activeCaptureLineId}`
    : editor.captureCursorLineId
      ? `next:${editor.captureCursorLineId}`
      : null;
  const selectedLine =
    editor.document.lines.find((line) => line.id === editor.selectedLineId) ?? null;
  const [addPanelState, setAddPanelState] = useState<AddPanelState>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const [confirmDeleteState, setConfirmDeleteState] = useState<ConfirmDeleteState>(null);

  useEffect(() => {
    const previousCaptureTarget = previousCaptureTargetRef.current;
    previousCaptureTargetRef.current = captureTargetKey;
    if (!captureTargetLineId || !captureTargetKey || previousCaptureTarget === captureTargetKey) return;

    const list = listRef.current;
    const row = rowContainerRefs.current.get(captureTargetLineId);
    if (!list || !row) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';

    row.scrollIntoView({
      block: 'nearest',
      behavior,
    });

    window.requestAnimationFrame(() => {
      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const rowTop = rowRect.top - listRect.top + list.scrollTop;
      const rowBottom = rowTop + row.offsetHeight;
      const visibleTop = list.scrollTop;
      const visibleBottom = visibleTop + list.clientHeight;

      if (rowTop >= visibleTop && rowBottom <= visibleBottom) return;

      const nextTop = rowTop < visibleTop ? rowTop : rowBottom - list.clientHeight;
      list.scrollTo({
        top: nextTop,
        behavior,
      });
    });
  }, [captureTargetKey, captureTargetLineId]);

  useEffect(() => {
    if (!addPanelState) return;
    addInputRef.current?.focus();
    addInputRef.current?.select();
  }, [addPanelState != null]);

  useEffect(() => {
    if (!editState) return;
    editInputRef.current?.focus({ preventScroll: true });
    editInputRef.current?.select();
  }, [editState?.lineId]);

  useEffect(() => {
    if (confirmDeleteState && confirmDeleteState.lineId !== editor.selectedLineId) {
      setConfirmDeleteState(null);
    }
  }, [confirmDeleteState, editor.selectedLineId]);

  useEffect(() => {
    if (!focusSelectedRowAfterRenderRef.current || !selectedLine) return;
    rowRefs.current.get(selectedLine.id)?.focus();
    focusSelectedRowAfterRenderRef.current = false;
  }, [selectedLine]);

  const focusSelectedRow = () => {
    if (!selectedLine) return;
    rowRefs.current.get(selectedLine.id)?.focus();
  };

  const closeAddPanel = () => {
    setAddPanelState(null);
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const closeEditor = (focusSelection: boolean) => {
    setEditState(null);
    if (!focusSelection) return;
    window.requestAnimationFrame(() => focusSelectedRow());
  };

  const submitAddLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!addPanelState) return;

    const error = getTrimmedTextError(addPanelState.value, 'add');
    if (error) {
      setAddPanelState({ ...addPanelState, error });
      addInputRef.current?.focus();
      return;
    }

    focusSelectedRowAfterRenderRef.current = true;
    onAddLine(editor.selectedLineId, addPanelState.value);
    setAddPanelState(null);
  };

  const openEditor = (lineId: string, text: string) => {
    onInspect(lineId);
    setConfirmDeleteState(null);
    setEditState((current) =>
      current?.lineId === lineId
        ? current
        : {
            lineId,
            initialValue: text,
            value: text,
            error: null,
          },
    );
  };

  const commitEdit = (
    lineId: string,
    value: string,
    initialValue: string,
    options?: { focusSelection?: boolean },
  ) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setEditState((current) =>
        current?.lineId === lineId
          ? { ...current, error: getTrimmedTextError(current.value, 'save') }
          : current,
      );
      return false;
    }

    if (trimmed === initialValue) {
      closeEditor(options?.focusSelection ?? false);
      return true;
    }

    focusSelectedRowAfterRenderRef.current = options?.focusSelection ?? true;
    onEditLineText(lineId, value);
    setEditState(null);
    return true;
  };

  const requestDeleteLine = (lineId: string, text: string, hasSegment: boolean) => {
    if (editState?.lineId === lineId) {
      suppressNextBlurSaveRef.current = true;
      setEditState(null);
    }
    if (hasSegment) {
      onInspect(lineId);
      setConfirmDeleteState({ lineId, text });
      return;
    }
    onDeleteLine(lineId);
  };

  const moveLineByKeyboard = (lineId: string, delta: -1 | 1) => {
    const currentIndex = editor.document.lines.findIndex((line) => line.id === lineId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= editor.document.lines.length) return;
    focusSelectedRowAfterRenderRef.current = true;
    onReorderLine(lineId, nextIndex);
  };

  return (
    <section className="lyrics-panel" aria-labelledby="lyrics-title">
      <div className="section-heading lyrics-heading">
        <h2 id="lyrics-title">Lyrics</h2>
        <div className="lyrics-toolbar">
          <span className="line-progress">
            {completedCount} / {editor.document.lines.length} timed
          </span>
          <button
            ref={addButtonRef}
            type="button"
            className="lyrics-add-button"
            onClick={() => setAddPanelState({ value: '', error: null })}
          >
            <span>Add line</span>
          </button>
        </div>
      </div>

      {addPanelState ? (
        <form className="lyrics-inline-editor" onSubmit={submitAddLine}>
          <label>
            <span className="sr-only">New lyric line text</span>
            <input
              ref={addInputRef}
              type="text"
              value={addPanelState.value}
              onChange={(event) =>
                setAddPanelState({
                  value: event.target.value,
                  error: null,
                })
              }
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                closeAddPanel();
              }}
              placeholder="Add a lyric line after the current selection"
              aria-invalid={addPanelState.error ? 'true' : 'false'}
              aria-describedby={addPanelState.error ? 'lyrics-inline-editor-error' : undefined}
            />
          </label>
          <div className="lyrics-inline-editor-actions">
            <button type="submit" className="lyrics-inline-submit">
              Add
            </button>
            <button
              type="button"
              className="lyrics-inline-cancel"
              onClick={closeAddPanel}
            >
              Cancel
            </button>
          </div>
          {addPanelState.error ? (
            <p id="lyrics-inline-editor-error" className="form-error" role="alert">
              {addPanelState.error}
            </p>
          ) : null}
        </form>
      ) : null}

      <ol ref={listRef} className="lyric-list">
        {editor.document.lines.map((line) => {
          const segment = editor.segments[line.id];
          const isSelected = editor.selectedLineId === line.id;
          const isEditing = editState?.lineId === line.id;
          const isPlaying = playingLineId === line.id;
          const isActiveCapture = activeCaptureLineId === line.id;
          const isNeedsAttention = editor.captureCursorLineId === line.id && !isActiveCapture;
          const canPlaceOnTimeline = !segment && editor.openSegment?.lineId !== line.id;
          const canDeleteLine =
            editor.document.lines.length > 1 && editor.openSegment?.lineId !== line.id;
          const deleteHint =
            editor.openSegment?.lineId === line.id
              ? 'Finish the current capture before deleting this line.'
              : editor.document.lines.length === 1
                ? 'Add another lyric line before deleting the final remaining line.'
                : null;
          const timeChipLabel = segment ? formatTime(segment.startMs) : '—';
          const timeChipTitle = segment
            ? `Start time ${formatTime(segment.startMs)}`
            : 'Untimed line';
          const showDeleteConfirmation = confirmDeleteState?.lineId === line.id;
          const feedbackMessage = isEditing && editState.error ? editState.error : deleteHint;

          return (
            <li key={line.id} className="lyric-row-stack">
              {lineMergeTargetLineId == null && lineReorderInsertionIndex === line.index ? (
                <div className="lyric-reorder-indicator" aria-hidden="true" />
              ) : null}
              <div
                data-lyric-row="true"
                className="lyric-row-card"
                ref={(element) => {
                  if (element) rowContainerRefs.current.set(line.id, element);
                  else rowContainerRefs.current.delete(line.id);
                }}
                data-selected={isSelected || undefined}
                data-editing={isEditing || undefined}
                data-playing={isPlaying || undefined}
                data-timed={segment != null || undefined}
                data-active-capture={isActiveCapture || undefined}
                data-needs-attention={isNeedsAttention || undefined}
                data-merge-target={lineMergeTargetLineId === line.id || undefined}
              >
                <div className="lyric-row-main">
                  <button
                    type="button"
                    className="lyric-drag-handle"
                    data-dragging={activePlacementLineId === line.id || undefined}
                    title={
                      canPlaceOnTimeline
                        ? 'Drag to reorder, merge, or place on timeline'
                        : 'Drag to reorder or merge'
                    }
                    aria-label={
                      canPlaceOnTimeline
                        ? `Reorder, merge, or drag lyric line ${line.text}`
                        : `Reorder or merge lyric line ${line.text}`
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                      if (!event.altKey) return;
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        moveLineByKeyboard(line.id, -1);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        moveLineByKeyboard(line.id, 1);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      onStartPlacementDrag(
                        line.id,
                        line.index,
                        line.text,
                        listRef.current,
                        event.pointerId,
                        event.clientX,
                        event.clientY,
                      );
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onLostPointerCapture={(event) => {
                      onPlacementDragLostPointerCapture(event.pointerId);
                    }}
                  >
                    <GripVertical aria-hidden="true" size={16} strokeWidth={1.9} />
                  </button>

                  <button
                    type="button"
                    className="lyric-time-chip"
                    aria-pressed={isSelected}
                    aria-label={timeChipTitle}
                    title={timeChipTitle}
                    onClick={() => onSelect(line.id)}
                  >
                    <span
                      className="lyric-time-chip-value"
                      data-empty={segment == null || undefined}
                      aria-hidden="true"
                    >
                      {timeChipLabel}
                    </span>
                  </button>

                  {isEditing ? (
                    <label
                      className="lyric-edit-field"
                      data-merge-zone="true"
                      data-line-id={line.id}
                    >
                      <span className="sr-only">Edit lyric text</span>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editState.value}
                        onChange={(event) =>
                          setEditState((current) =>
                            current?.lineId === line.id
                              ? { ...current, value: event.target.value, error: null }
                              : current,
                          )
                        }
                        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                          if (event.nativeEvent.isComposing) return;

                          if (event.key === 'Escape') {
                            event.preventDefault();
                            closeEditor(true);
                            return;
                          }

                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void commitEdit(
                              line.id,
                              editState.value,
                              editState.initialValue,
                              { focusSelection: true },
                            );
                          }
                        }}
                        onBlur={() => {
                          if (suppressNextBlurSaveRef.current) {
                            suppressNextBlurSaveRef.current = false;
                            return;
                          }
                          if (!editState || editState.lineId !== line.id) return;
                          void commitEdit(line.id, editState.value, editState.initialValue);
                        }}
                        aria-invalid={editState.error ? 'true' : 'false'}
                        aria-describedby={editState.error ? `lyric-edit-error-${line.id}` : undefined}
                      />
                    </label>
                  ) : (
                    <button
                      type="button"
                      className="lyric-text-trigger"
                      data-merge-zone="true"
                      data-line-id={line.id}
                      ref={(element) => {
                        if (element) rowRefs.current.set(line.id, element);
                        else rowRefs.current.delete(line.id);
                      }}
                      aria-label="Edit lyric text"
                      aria-pressed={isSelected}
                      title={line.text}
                      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                        if (!event.altKey) return;
                        if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          moveLineByKeyboard(line.id, -1);
                        } else if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          moveLineByKeyboard(line.id, 1);
                        }
                      }}
                      onClick={() => openEditor(line.id, line.text)}
                    >
                      <span className="lyric-text-display">{line.text}</span>
                    </button>
                  )}

                  {lineMergeTargetLineId === line.id ? (
                    <span className="lyric-merge-hint" aria-hidden="true">
                      Merge with this line
                    </span>
                  ) : null}

                  <div className="lyric-row-delete-slot">
                    <button
                      type="button"
                      className="lyric-icon-button lyric-icon-button-delete"
                      aria-label="Delete lyric line"
                      title={deleteHint ?? 'Delete lyric line'}
                      disabled={!canDeleteLine}
                      onPointerDown={() => {
                        if (isEditing) {
                          suppressNextBlurSaveRef.current = true;
                        }
                      }}
                      onClick={() => requestDeleteLine(line.id, line.text, segment != null)}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={1.9} />
                    </button>
                  </div>
                </div>

                {feedbackMessage ? (
                  <p
                    id={`lyric-edit-error-${line.id}`}
                    className="lyric-row-feedback"
                    role={isEditing && editState.error ? 'alert' : undefined}
                  >
                    {feedbackMessage}
                  </p>
                ) : null}
              </div>

              {showDeleteConfirmation ? (
                <div className="lyric-delete-confirmation" role="alertdialog" aria-modal="false">
                  <p>
                    Delete lyric line <strong>{confirmDeleteState.text}</strong>? Its saved timing
                    will be removed too.
                  </p>
                  <div className="lyrics-inline-editor-actions">
                    <button
                      type="button"
                      className="lyrics-inline-delete"
                      onClick={() => {
                        focusSelectedRowAfterRenderRef.current = true;
                        onDeleteLine(confirmDeleteState.lineId);
                        setConfirmDeleteState(null);
                      }}
                    >
                      Delete line
                    </button>
                    <button
                      type="button"
                      className="lyrics-inline-cancel"
                      onClick={() => {
                        setConfirmDeleteState(null);
                        focusSelectedRow();
                      }}
                    >
                      Keep line
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
        {lineMergeTargetLineId == null && lineReorderInsertionIndex === editor.document.lines.length ? (
          <li aria-hidden="true" className="lyric-row-stack">
            <div className="lyric-reorder-indicator" />
          </li>
        ) : null}
      </ol>
    </section>
  );
}
