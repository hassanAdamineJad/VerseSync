import { useEffect, useRef } from 'react';
import { formatTime, type EditorState } from '../editor';

type Props = {
  editor: EditorState;
  playingLineId: string | null;
  activePlacementLineId: string | null;
  onSelect: (lineId: string) => void;
  onStartPlacementDrag: (
    lineId: string,
    lineIndex: number,
    text: string,
    pointerId: number,
    clientX: number,
    clientY: number,
  ) => void;
  onPlacementDragLostPointerCapture: (pointerId: number) => void;
};

export function LyricsPanel({
  editor,
  playingLineId,
  activePlacementLineId,
  onSelect,
  onStartPlacementDrag,
  onPlacementDragLostPointerCapture,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
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
          const canPlaceOnTimeline = !segment && !isOpen;

          return (
            <li key={line.id} className="lyric-row-shell">
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
                onClick={() => onSelect(line.id)}
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
              {canPlaceOnTimeline ? (
                <button
                  type="button"
                  className="lyric-drag-handle"
                  data-dragging={activePlacementLineId === line.id || undefined}
                  title="Drag onto timeline to place"
                  aria-label={`Drag ${line.text} onto timeline to place`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    onStartPlacementDrag(
                      line.id,
                      line.index,
                      line.text,
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
                  <span className="lyric-drag-grip" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
