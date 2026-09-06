import { useEffect, useRef } from 'react';
import { formatTime, type EditorState } from '../editor';

type Props = {
  editor: EditorState;
  playingLineId: string | null;
  onSelect: (lineId: string) => void;
  onPlacementDragMove: (
    lineId: string,
    text: string,
    clientX: number,
    clientY: number,
  ) => void;
  onPlacementDragEnd: () => void;
  onPlacementDragCancel: () => void;
};

type PlacementDragState = {
  pointerId: number;
  lineId: string;
  text: string;
  startClientX: number;
  startClientY: number;
  hasDragged: boolean;
};

const PLACEMENT_DRAG_THRESHOLD_PX = 4;

export function LyricsPanel({
  editor,
  playingLineId,
  onSelect,
  onPlacementDragMove,
  onPlacementDragEnd,
  onPlacementDragCancel,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const placementDragRef = useRef<PlacementDragState | null>(null);
  const suppressClickLineIdRef = useRef<string | null>(null);
  const completedCount = Object.keys(editor.segments).length;
  const activeCaptureLineId = editor.openSegment?.lineId ?? null;

  useEffect(() => {
    if (!activeCaptureLineId) return;

    const list = listRef.current;
    const row = rowRefs.current.get(activeCaptureLineId);
    if (!list || !row) return;

    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleTop = list.scrollTop;
    const visibleBottom = visibleTop + list.clientHeight;
    const isAbove = rowTop < visibleTop;
    const isBelow = rowBottom > visibleBottom;

    if (!isAbove && !isBelow) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextTop = isAbove ? rowTop : rowBottom - list.clientHeight;
    list.scrollTo({
      top: nextTop,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [activeCaptureLineId]);

  return (
    <section className="lyrics-panel" aria-labelledby="lyrics-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lyric sheet</p>
          <h2 id="lyrics-title">Lines</h2>
        </div>
        <span className="line-progress">
          {completedCount} / {editor.document.lines.length} timed
        </span>
      </div>

      <ol ref={listRef} className="lyric-list">
        {editor.document.lines.map((line) => {
          const segment = editor.segments[line.id];
          const isOpen = editor.openSegment?.lineId === line.id;
          const isSelected = editor.selectedLineId === line.id;
          const isPlaying = playingLineId === line.id;
          const stateLabel = isOpen ? 'Capturing' : segment ? 'Completed' : 'Untimed';

          return (
            <li key={line.id}>
              <button
                type="button"
                className="lyric-row"
                ref={(element) => {
                  if (element) rowRefs.current.set(line.id, element);
                  else rowRefs.current.delete(line.id);
                }}
                data-selected={isSelected || undefined}
                data-playing={isPlaying || undefined}
                data-capturing={isOpen || undefined}
                aria-pressed={isSelected}
                onClick={() => {
                  if (suppressClickLineIdRef.current === line.id) {
                    suppressClickLineIdRef.current = null;
                    return;
                  }
                  onSelect(line.id);
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || segment || isOpen) return;
                  placementDragRef.current = {
                    pointerId: event.pointerId,
                    lineId: line.id,
                    text: line.text,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    hasDragged: false,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const dragState = placementDragRef.current;
                  if (
                    !dragState ||
                    dragState.pointerId !== event.pointerId ||
                    dragState.lineId !== line.id
                  ) {
                    return;
                  }

                  const deltaX = event.clientX - dragState.startClientX;
                  const deltaY = event.clientY - dragState.startClientY;
                  if (!dragState.hasDragged) {
                    if (Math.hypot(deltaX, deltaY) < PLACEMENT_DRAG_THRESHOLD_PX) return;
                    dragState.hasDragged = true;
                  }

                  onPlacementDragMove(
                    dragState.lineId,
                    dragState.text,
                    event.clientX,
                    event.clientY,
                  );
                }}
                onPointerUp={(event) => {
                  const dragState = placementDragRef.current;
                  if (
                    !dragState ||
                    dragState.pointerId !== event.pointerId ||
                    dragState.lineId !== line.id
                  ) {
                    return;
                  }

                  placementDragRef.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  if (!dragState.hasDragged) return;
                  suppressClickLineIdRef.current = line.id;
                  onPlacementDragEnd();
                }}
                onPointerCancel={(event) => {
                  const dragState = placementDragRef.current;
                  if (
                    !dragState ||
                    dragState.pointerId !== event.pointerId ||
                    dragState.lineId !== line.id
                  ) {
                    return;
                  }

                  placementDragRef.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  if (dragState.hasDragged) {
                    suppressClickLineIdRef.current = line.id;
                    onPlacementDragCancel();
                  }
                }}
              >
                <span className="lyric-index">{String(line.index + 1).padStart(2, '0')}</span>
                <span className="lyric-copy">
                  <span className="lyric-text">{line.text}</span>
                  <span className="lyric-time">
                    {segment
                      ? `${formatTime(segment.startMs)} – ${formatTime(segment.endMs)}`
                      : isOpen
                        ? `Opened ${formatTime(editor.openSegment?.startMs ?? 0)}`
                        : 'Ready to time'}
                  </span>
                </span>
                <span className="line-labels">
                  <span className="line-state">{stateLabel}</span>
                  {isSelected && <span>Selected</span>}
                  {isPlaying && <span>Playing</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
