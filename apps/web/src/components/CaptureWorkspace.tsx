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
  const idleLine = editor.document.lines.find(
    (line) => line.id === (editor.captureCursorLineId ?? editor.selectedLineId),
  );
  const captureLine = openLine ?? idleLine ?? null;
  const openIndex = openLine
    ? editor.document.lines.findIndex((line) => line.id === openLine.id)
    : -1;
  const nextLine =
    openIndex >= 0
      ? editor.document.lines
          .slice(openIndex + 1)
          .find((line) => editor.segments[line.id] == null)
      : null;
  const isFinalOpenLine = openLine != null && nextLine == null;

  useEffect(() => {
    if (shortcutsDisabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        onTogglePlayback();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        onStamp();
      } else if (event.key.toLowerCase() === 'f' && editor.openSegment) {
        event.preventDefault();
        onFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor.openSegment, onFinish, onStamp, onTogglePlayback, shortcutsDisabled]);

  let nextAction = 'Select an untimed line, then stamp its start at the playhead.';
  if (!editor.openSegment && captureLine) {
    nextAction = editor.segments[captureLine.id]
      ? 'This line is already timed. Select an untimed line to continue.'
      : `The next stamp opens “${captureLine.text}” at the current playhead.`;
  } else if (openLine && nextLine) {
    nextAction = `The next stamp closes “${openLine.text}” and opens “${nextLine.text}”.`;
  } else if (openLine) {
    nextAction = `Finish Line closes “${openLine.text}” without advancing.`;
  }

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
        <div className="capture-status">
          <p className="eyebrow">{openLine ? 'Capturing now' : 'Ready to capture'}</p>
          <h2 id="capture-title">{captureLine?.text ?? 'All lines are timed'}</h2>
          {openLine && (
            <span className="capture-start">
              Opened at {formatTime(editor.openSegment?.startMs ?? 0)}
            </span>
          )}
        </div>

        <p className="next-action">{nextAction}</p>

        <div className="capture-actions">
          {isFinalOpenLine ? (
            <button type="button" className="primary-action" onClick={onFinish}>
              Finish Line
              <kbd>F</kbd>
            </button>
          ) : (
            <button
              type="button"
              className="primary-action"
              onClick={onStamp}
              disabled={!captureLine}
            >
              {openLine ? 'Stamp & Next' : 'Stamp'}
              <kbd>S</kbd>
            </button>
          )}
          {openLine && !isFinalOpenLine && (
            <button type="button" onClick={onFinish}>
              Finish Line
              <kbd>F</kbd>
            </button>
          )}
        </div>

        {editor.message && (
          <p className="editor-message" role="status" aria-live="polite">
            {editor.message}
          </p>
        )}
      </section>
    </section>
  );
}
