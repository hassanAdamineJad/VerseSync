import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Pause, Pencil, Play } from 'lucide-react';
import {
  formatLyricLineNumber,
  formatPreviewTimeRange,
  formatTime,
  getPreviewActiveLineId,
  getPreviewAnchorLineId,
  getPreviewLyricLines,
  getSeekStepMs,
  type EditorState,
  type PreviewLyricLine,
} from '../editor';

type Props = {
  editor: EditorState;
  currentTimeMs: number;
  isPlaying: boolean;
  isPlaybackReady: boolean;
  readCurrentTimeMs: () => number;
  onTogglePlayback: () => void;
  onSeek: (nextMs: number) => void;
  onEditTiming: (lineId: string) => void;
  onClose: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') != null
  );
}

function usePreviewLyricTime(
  editor: EditorState,
  isPlaying: boolean,
  currentTimeMs: number,
  readCurrentTimeMs: () => number,
): number {
  const [lyricTimeMs, setLyricTimeMs] = useState(currentTimeMs);

  useEffect(() => {
    setLyricTimeMs(currentTimeMs);
  }, [currentTimeMs]);

  useEffect(() => {
    if (!isPlaying) return;

    let frameId = 0;
    const tick = () => {
      setLyricTimeMs((previous) => {
        const next = readCurrentTimeMs();
        if (
          getPreviewActiveLineId(editor, previous) === getPreviewActiveLineId(editor, next) &&
          getPreviewAnchorLineId(editor, previous) === getPreviewAnchorLineId(editor, next)
        ) {
          return previous;
        }
        return next;
      });
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [editor, isPlaying, readCurrentTimeMs]);

  return isPlaying ? lyricTimeMs : currentTimeMs;
}

function getPreviewRowLabel(line: PreviewLyricLine): string {
  const number = formatLyricLineNumber(line.index);
  if (line.startMs == null || line.endMs == null) {
    return `Line ${number}, ${line.text}, Untimed`;
  }
  return `Line ${number}, ${line.text}, ${formatTime(line.startMs)} to ${formatTime(line.endMs)}`;
}

function getPreviewTimeLabel(line: PreviewLyricLine): string {
  if (line.startMs == null || line.endMs == null) return 'Untimed';
  if (line.isActive) return formatPreviewTimeRange(line.startMs, line.endMs);
  return formatTime(line.startMs);
}

export function PreviewModal({
  editor,
  currentTimeMs,
  isPlaying,
  isPlaybackReady,
  readCurrentTimeMs,
  onTogglePlayback,
  onSeek,
  onEditTiming,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [reviewLineId, setReviewLineId] = useState<string | null>(null);
  const durationMs = editor.document.durationMs;
  const seekStepMs = getSeekStepMs(durationMs);
  const lyricTimeMs = usePreviewLyricTime(
    editor,
    isPlaying,
    currentTimeMs,
    readCurrentTimeMs,
  );
  const previewLines = useMemo(
    () => getPreviewLyricLines(editor, lyricTimeMs),
    [editor, lyricTimeMs],
  );
  const timedVisibleLines = useMemo(
    () => previewLines.filter((line) => !line.isUntimed),
    [previewLines],
  );
  const activeLineId = getPreviewActiveLineId(editor, lyricTimeMs);
  const editTargetId =
    (reviewLineId && editor.segments[reviewLineId] ? reviewLineId : null) ??
    (activeLineId && editor.segments[activeLineId] ? activeLineId : null);
  const timedCount = Object.keys(editor.segments).length;
  const totalLineCount = editor.document.lines.length;
  const fileName =
    editor.document.source.kind === 'local' ? editor.document.source.fileName : null;
  const showFileName = fileName != null && fileName !== editor.document.title;
  const progressPercent =
    durationMs <= 0 ? 0 : Math.min(Math.max((currentTimeMs / durationMs) * 100, 0), 100);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusableElements || focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (!first || !last) return;

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.code === 'Space') {
        if (event.repeat) return;
        event.preventDefault();
        onTogglePlayback();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onSeek(readCurrentTimeMs() - seekStepMs);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onSeek(readCurrentTimeMs() + seekStepMs);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (timedVisibleLines.length === 0) return;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const currentId = reviewLineId ?? activeLineId ?? timedVisibleLines[0]?.id ?? null;
        const currentIndex = timedVisibleLines.findIndex((line) => line.id === currentId);
        const fromIndex = currentIndex === -1 ? (delta > 0 ? -1 : timedVisibleLines.length) : currentIndex;
        const nextLine = timedVisibleLines[Math.min(Math.max(fromIndex + delta, 0), timedVisibleLines.length - 1)];
        if (nextLine) setReviewLineId(nextLine.id);
        return;
      }

      if (event.key === 'Enter') {
        const targetId = reviewLineId ?? activeLineId;
        const segment = targetIdSegment(editor, targetId);
        if (!segment) return;
        event.preventDefault();
        setReviewLineId(segment.lineId);
        onSeek(segment.startMs);
        return;
      }

      if (event.code === 'KeyE' && !event.repeat) {
        if (!editTargetId) return;
        event.preventDefault();
        onEditTiming(editTargetId);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    activeLineId,
    editTargetId,
    editor,
    onClose,
    onEditTiming,
    onSeek,
    onTogglePlayback,
    readCurrentTimeMs,
    reviewLineId,
    seekStepMs,
    timedVisibleLines,
  ]);

  const selectTimedLine = (line: PreviewLyricLine) => {
    if (line.startMs == null) return;
    setReviewLineId(line.id);
    onSeek(line.startMs);
  };

  return (
    <div className="preview-overlay">
      <div
        ref={dialogRef}
        className="preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        tabIndex={-1}
      >
        <div className="preview-toolbar">
          <button type="button" className="preview-back-button" onClick={onClose}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.9} />
            <span>Back to editor</span>
          </button>
          <p className="preview-status">{`${timedCount} of ${totalLineCount} lines timed`}</p>
        </div>

        <div className="preview-stage">
          <header className="preview-track">
            <h2 id="preview-title">{editor.document.title}</h2>
            {showFileName ? <p className="preview-filename">{fileName}</p> : null}
          </header>

          <div className="preview-lyrics">
            <div className="preview-lyrics-stack">
              {previewLines.map((line) => {
                const kind = line.isActive
                  ? 'current'
                  : line.offset === 0
                    ? 'idle'
                    : line.offset < 0
                      ? 'before'
                      : 'after';
                const isReview = reviewLineId === line.id && !line.isActive;
                const timeLabel = getPreviewTimeLabel(line);
                const className = `preview-line is-${kind}${line.isUntimed ? ' is-untimed' : ''}${isReview ? ' is-review' : ''}`;
                const style = { '--preview-line-offset': line.offset } as CSSProperties;
                const content = (
                  <>
                    <span className="preview-line-number" aria-hidden="true">
                      {formatLyricLineNumber(line.index)}
                    </span>
                    <span className="preview-line-text">{line.text}</span>
                    <span className="preview-line-time">{timeLabel}</span>
                  </>
                );

                if (line.isUntimed) {
                  return (
                    <div
                      key={line.id}
                      className={className}
                      data-preview-line=""
                      data-line-id={line.id}
                      data-untimed="true"
                      data-distance={Math.abs(line.offset)}
                      role="group"
                      aria-label={getPreviewRowLabel(line)}
                      style={style}
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <button
                    key={line.id}
                    type="button"
                    className={className}
                    data-preview-line=""
                    data-line-id={line.id}
                    data-active={line.isActive || undefined}
                    data-review={isReview || undefined}
                    data-distance={Math.abs(line.offset)}
                    aria-label={getPreviewRowLabel(line)}
                    aria-pressed={reviewLineId === line.id}
                    style={style}
                    onFocus={() => setReviewLineId(line.id)}
                    onClick={() => selectTimedLine(line)}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="preview-review-actions">
            <button
              type="button"
              className="preview-edit-timing"
              onClick={() => {
                if (editTargetId) onEditTiming(editTargetId);
              }}
              disabled={editTargetId == null}
              title={
                editTargetId
                  ? 'Edit this lyric in the editor'
                  : 'Select a timed lyric to edit.'
              }
            >
              <Pencil aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>Edit timing</span>
            </button>
          </div>

          <div className="preview-transport">
            <button
              type="button"
              className="preview-playback-button"
              onClick={onTogglePlayback}
              disabled={!isPlaybackReady}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={`${isPlaying ? 'Pause' : 'Play'} (Space)`}
            >
              {isPlaying ? (
                <Pause aria-hidden="true" size={18} strokeWidth={2} />
              ) : (
                <Play aria-hidden="true" size={18} strokeWidth={2} />
              )}
            </button>

            <div className="preview-clock">
              <span>{formatTime(currentTimeMs)}</span>
              <span aria-hidden="true">/</span>
              <span>{formatTime(durationMs)}</span>
            </div>

            <label className="preview-seek">
              <span className="sr-only">Playback position</span>
              <input
                type="range"
                min={0}
                max={durationMs}
                step={seekStepMs}
                value={currentTimeMs}
                disabled={!isPlaybackReady || durationMs <= 0}
                aria-valuemin={0}
                aria-valuemax={durationMs}
                aria-valuenow={currentTimeMs}
                aria-valuetext={formatTime(currentTimeMs)}
                onChange={(event) => onSeek(Number(event.target.value))}
                style={{ '--preview-seek-progress': `${progressPercent}%` } as CSSProperties}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function targetIdSegment(editor: EditorState, lineId: string | null) {
  if (!lineId) return null;
  return editor.segments[lineId] ?? null;
}
