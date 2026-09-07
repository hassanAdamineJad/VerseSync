import { useEffect } from 'react';
import { formatTime, type CompletedSegment, type EditorState } from '../editor';
import { TimelineOverview } from './TimelineOverview';

type LinePlacementPreview = {
  lineId: string;
  text: string;
  clientX: number;
  clientY: number;
  segment: CompletedSegment | null;
  snapTargetMs: number | null;
} | null;

type TimelineLaneMetrics = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  visibleStartMs: number;
  visibleWindowMs: number;
  durationMs: number;
};

type Props = {
  editor: EditorState;
  dragPreviewSegments: CompletedSegment[] | null;
  linePlacementPreview: LinePlacementPreview;
  currentTimeMs: number;
  shortcutsDisabled: boolean;
  onSelectedSegmentCountChange: (count: number) => void;
  onSelectSegment: (lineId: string) => void;
  onPreviewSegmentDrag: (segments: CompletedSegment[]) => void;
  onCommitSegmentDrag: (segments: CompletedSegment[]) => void;
  onCancelSegmentDrag: () => void;
  onTimelineLaneMetricsChange: (metrics: TimelineLaneMetrics) => void;
  onSeek: (nextMs: number) => void;
  onTogglePlayback: () => void;
  onStamp: () => void;
  onFinish: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, button, a, [contenteditable="true"]') != null
  );
}

export function CaptureWorkspace({
  editor,
  dragPreviewSegments,
  linePlacementPreview,
  currentTimeMs,
  shortcutsDisabled,
  onSelectedSegmentCountChange,
  onSelectSegment,
  onPreviewSegmentDrag,
  onCommitSegmentDrag,
  onCancelSegmentDrag,
  onTimelineLaneMetricsChange,
  onSeek,
  onTogglePlayback,
  onStamp,
  onFinish,
}: Props) {
  const openLine = editor.openSegment
    ? editor.document.lines.find((line) => line.id === editor.openSegment?.lineId) ?? null
    : null;
  const readyLine = editor.captureCursorLineId
    ? editor.document.lines.find((line) => line.id === editor.captureCursorLineId) ?? null
    : null;
  const isComplete = openLine == null && readyLine == null;
  const captureLine = openLine ?? readyLine ?? null;
  const activeLineIndex = captureLine
    ? editor.document.lines.findIndex((line) => line.id === captureLine.id)
    : -1;
  const nextLine =
    activeLineIndex >= 0
      ? editor.document.lines
          .slice(activeLineIndex + 1)
          .find((line) => editor.segments[line.id] == null)
      : null;
  const isFinalOpenLine = openLine != null && nextLine == null;
  const previousContextLine =
    activeLineIndex > 0 ? editor.document.lines[activeLineIndex - 1] ?? null : null;
  const nextContextLine =
    activeLineIndex >= 0 ? editor.document.lines[activeLineIndex + 1] ?? null : null;
  const canStamp = !isComplete && (openLine != null || readyLine != null);

  useEffect(() => {
    if (shortcutsDisabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        onTogglePlayback();
      } else if (event.key.toLowerCase() === 's' && canStamp) {
        event.preventDefault();
        onStamp();
      } else if (event.key.toLowerCase() === 'f' && editor.openSegment) {
        event.preventDefault();
        onFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canStamp, editor.openSegment, onFinish, onStamp, onTogglePlayback, shortcutsDisabled]);

  return (
    <section className="capture-workspace">
      <TimelineOverview
        editor={editor}
        dragPreviewSegments={dragPreviewSegments}
        linePlacementPreview={linePlacementPreview}
        currentTimeMs={currentTimeMs}
        onSelectedSegmentCountChange={onSelectedSegmentCountChange}
        onSelectSegment={onSelectSegment}
        onPreviewSegmentDrag={onPreviewSegmentDrag}
        onCommitSegmentDrag={onCommitSegmentDrag}
        onCancelSegmentDrag={onCancelSegmentDrag}
        onTimelineLaneMetricsChange={onTimelineLaneMetricsChange}
        onSeek={onSeek}
      />

      <section className="capture-card" aria-labelledby="capture-title">
        <div
          className="capture-stage"
          data-state={openLine ? 'capturing' : isComplete ? 'complete' : 'ready'}
        >
          <div className="capture-status">
            <p className="capture-state-label">
              {openLine ? 'Capturing' : isComplete ? 'Complete' : 'Ready'}
            </p>
            {openLine ? (
              <div className="capture-inline-meta" aria-live="polite">
                {`Started ${formatTime(editor.openSegment?.startMs ?? 0)}`}
              </div>
            ) : (
              <span className="capture-inline-meta capture-inline-meta-placeholder" aria-hidden="true" />
            )}
          </div>

          <div className="capture-context" aria-live="polite">
            <p className="capture-context-line capture-context-line-prev">
              {isComplete ? '\u00A0' : (previousContextLine?.text ?? '\u00A0')}
            </p>
            <h2 id="capture-title">
              {isComplete ? 'All lyric lines are timed.' : (captureLine?.text ?? 'All lines are timed')}
            </h2>
            <p
              className={`capture-context-line ${isComplete ? 'capture-context-line-complete' : 'capture-context-line-next'}`}
            >
              {isComplete
                ? 'Review the alignment or export the LRC file.'
                : (nextContextLine?.text ?? '\u00A0')}
            </p>
          </div>

          <div className="capture-actions">
            {isComplete ? (
              <>
                <span className="capture-primary-placeholder" aria-hidden="true" />
                <span className="capture-action-placeholder" aria-hidden="true" />
              </>
            ) : isFinalOpenLine ? (
              <button
                type="button"
                className="primary-action"
                onClick={onFinish}
                aria-label="Finish line"
                title="Finish line (F)"
              >
                Finish
                <kbd>F</kbd>
              </button>
            ) : (
              <button
                type="button"
                className="primary-action"
                onClick={onStamp}
                disabled={!canStamp}
                aria-label={openLine ? 'Stamp and advance to next line' : 'Stamp line start'}
                title={`${openLine ? 'Stamp & Next' : 'Stamp'} (S)`}
              >
                {openLine ? 'Stamp & Next' : 'Stamp'}
                <kbd>S</kbd>
              </button>
            )}
            {openLine && !isFinalOpenLine ? (
              <button
                type="button"
                className="capture-secondary-action"
                onClick={onFinish}
                aria-label="Finish line"
                title="Finish line (F)"
              >
                Finish
                <kbd>F</kbd>
              </button>
            ) : (
              <span className="capture-action-placeholder" aria-hidden="true" />
            )}
          </div>

          <div className="capture-feedback" aria-live="polite">
            {editor.message ? (
              <p className="editor-message" role="status">
                {editor.message}
              </p>
            ) : (
              <span className="capture-feedback-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
