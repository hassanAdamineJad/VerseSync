import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatTime, type CompletedSegment, type EditorState } from '../editor';

type Props = {
  editor: EditorState;
  dragPreviewSegments: CompletedSegment[] | null;
  onApply: (lineId: string, startMs: number, endMs: number) => void;
};

export function SegmentInspector({ editor, dragPreviewSegments, onApply }: Props) {
  const selectedLine = editor.document.lines.find(
    (line) => line.id === editor.selectedLineId,
  );
  const segment = selectedLine
    ? (dragPreviewSegments?.find((preview) => preview.lineId === selectedLine.id) ??
      editor.segments[selectedLine.id])
    : undefined;
  const isOpen = selectedLine?.id === editor.openSegment?.lineId;
  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStartDraft(segment ? String(segment.startMs) : '');
    setEndDraft(segment ? String(segment.endMs) : '');
    setError(null);
  }, [segment?.endMs, segment?.lineId, segment?.startMs]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLine || !segment) return;

    const startMs = Number(startDraft);
    const endMs = Number(endDraft);
    if (!Number.isInteger(startMs) || startMs < 0) {
      setError('Start must be a whole, non-negative millisecond value.');
      startRef.current?.focus();
      return;
    }
    if (!Number.isInteger(endMs) || endMs > editor.document.durationMs) {
      setError(`End must be a whole millisecond value no later than ${editor.document.durationMs}.`);
      endRef.current?.focus();
      return;
    }
    if (endMs <= startMs) {
      setError('End must be later than start.');
      endRef.current?.focus();
      return;
    }

    setError(null);
    onApply(selectedLine.id, startMs, endMs);
  };

  return (
    <aside className="inspector-panel" aria-labelledby="inspector-title">
      <div>
        <p className="eyebrow">Segment inspector</p>
        <h2 id="inspector-title">Exact timing</h2>
      </div>

      {!selectedLine && <p>Select a lyric line to inspect it.</p>}

      {selectedLine && (
        <div className="inspector-content">
          <div className="inspector-lyric">
            <span>Selected line</span>
            <strong>{selectedLine.text}</strong>
          </div>

          {segment ? (
            <form onSubmit={handleSubmit}>
              <div className="timing-fields">
                <label>
                  Start (ms)
                  <input
                    ref={startRef}
                    type="number"
                    min={0}
                    max={editor.document.durationMs}
                    step={1}
                    inputMode="numeric"
                    value={startDraft}
                    onChange={(event) => setStartDraft(event.target.value)}
                  />
                </label>
                <label>
                  End (ms)
                  <input
                    ref={endRef}
                    type="number"
                    min={0}
                    max={editor.document.durationMs}
                    step={1}
                    inputMode="numeric"
                    value={endDraft}
                    onChange={(event) => setEndDraft(event.target.value)}
                  />
                </label>
              </div>
              <dl className="timing-summary">
                <div>
                  <dt>Start</dt>
                  <dd>{formatTime(segment.startMs)}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{formatTime(segment.endMs)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatTime(segment.endMs - segment.startMs)}</dd>
                </div>
              </dl>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="inspector-apply">
                Apply exact timing
              </button>
            </form>
          ) : (
            <div className="inspector-empty">
              <span className="line-state">{isOpen ? 'Capturing' : 'Untimed'}</span>
              <p>
                {isOpen
                  ? 'Finish this line before editing its exact start and end.'
                  : 'Capture this line before editing its exact start and end.'}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
