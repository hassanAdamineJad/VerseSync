import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  formatTime,
  getMergeLineWithNextBlockReason,
  type CompletedSegment,
  type EditorState,
} from '../editor';
import { formatTimecode, parseTimecode } from '../timecode';

type Props = {
  editor: EditorState;
  dragPreviewSegments: CompletedSegment[] | null;
  selectedSegmentCount: number;
  onApply: (lineId: string, startMs: number, endMs: number) => void;
  onRemoveTiming: (lineId: string) => void;
  onMergeWithNext: (lineId: string) => void;
};

type FieldErrors = {
  start: string | null;
  end: string | null;
};

type TimingValidationResult =
  | { ok: true; startMs: number; endMs: number }
  | { ok: false; errors: FieldErrors };

function validateTimingInputs(
  startInput: string,
  endInput: string,
  durationMs: number,
): TimingValidationResult {
  const startParsed = parseTimecode(startInput);
  const endParsed = parseTimecode(endInput);
  const errors: FieldErrors = { start: null, end: null };

  if (!startParsed.ok) errors.start = `Start: ${startParsed.error}`;
  if (!endParsed.ok) errors.end = `End: ${endParsed.error}`;
  if (!startParsed.ok || !endParsed.ok) return { ok: false, errors };

  const startMs = startParsed.milliseconds;
  const endMs = endParsed.milliseconds;
  const maxLabel = formatTimecode(durationMs);

  if (startMs > durationMs) {
    errors.start = `Start must be no later than ${maxLabel}.`;
  }
  if (endMs > durationMs) {
    errors.end = `End must be no later than ${maxLabel}.`;
  }
  if (endMs <= startMs) {
    errors.end = 'End must be later than start.';
  }

  if (errors.start || errors.end) return { ok: false, errors };

  return { ok: true, startMs, endMs };
}

export function SegmentInspector({
  editor,
  dragPreviewSegments,
  selectedSegmentCount,
  onApply,
  onRemoveTiming,
  onMergeWithNext,
}: Props) {
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
  const [errors, setErrors] = useState<FieldErrors>({ start: null, end: null });
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const startErrorId = 'segment-inspector-start-error';
  const endErrorId = 'segment-inspector-end-error';

  useEffect(() => {
    setStartDraft(segment ? formatTimecode(segment.startMs) : '');
    setEndDraft(segment ? formatTimecode(segment.endMs) : '');
    setErrors({ start: null, end: null });
  }, [segment?.endMs, segment?.lineId, segment?.startMs]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLine || !segment) return;

    const validation = validateTimingInputs(
      startDraft,
      endDraft,
      editor.document.durationMs,
    );
    if (!validation.ok) {
      setErrors(validation.errors);
      if (validation.errors.start) {
        startRef.current?.focus();
      } else if (validation.errors.end) {
        endRef.current?.focus();
      }
      return;
    }

    setErrors({ start: null, end: null });
    setStartDraft(formatTimecode(validation.startMs));
    setEndDraft(formatTimecode(validation.endMs));
    onApply(selectedLine.id, validation.startMs, validation.endMs);
  };

  const handleStartChange = (value: string) => {
    setStartDraft(value);
    if (errors.start) {
      setErrors((current) => ({ ...current, start: null }));
    }
  };

  const handleEndChange = (value: string) => {
    setEndDraft(value);
    if (errors.end) {
      setErrors((current) => ({ ...current, end: null }));
    }
  };

  const applyDisabled = !selectedLine || !segment || !startDraft.trim() || !endDraft.trim();
  const mergeBlockReason = getMergeLineWithNextBlockReason(
    editor,
    selectedLine?.id ?? null,
    selectedSegmentCount,
  );

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
                  Start
                  <input
                    ref={startRef}
                    type="text"
                    inputMode="text"
                    value={startDraft}
                    onChange={(event) => handleStartChange(event.target.value)}
                    aria-invalid={errors.start ? 'true' : 'false'}
                    aria-describedby={errors.start ? startErrorId : undefined}
                    placeholder="00:13.252"
                  />
                  {errors.start ? (
                    <span id={startErrorId} className="field-error" role="alert">
                      {errors.start}
                    </span>
                  ) : null}
                </label>
                <label>
                  End
                  <input
                    ref={endRef}
                    type="text"
                    inputMode="text"
                    value={endDraft}
                    onChange={(event) => handleEndChange(event.target.value)}
                    aria-invalid={errors.end ? 'true' : 'false'}
                    aria-describedby={errors.end ? endErrorId : undefined}
                    placeholder="00:16.504"
                  />
                  {errors.end ? (
                    <span id={endErrorId} className="field-error" role="alert">
                      {errors.end}
                    </span>
                  ) : null}
                </label>
              </div>
              <dl className="timing-summary">
                <div>
                  <dt>Start</dt>
                  <dd>{formatTimecode(segment.startMs)}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{formatTimecode(segment.endMs)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatTime(segment.endMs - segment.startMs)}</dd>
                </div>
              </dl>
              <button type="submit" className="inspector-apply" disabled={applyDisabled}>
                Apply exact timing
              </button>
              <button
                type="button"
                className="inspector-secondary-action"
                onClick={() => onRemoveTiming(selectedLine.id)}
              >
                Remove timing
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
              {!isOpen ? (
                <p className="inspector-empty-note">
                  Edit text or delete this line from the selected actions in the lyric sheet.
                </p>
              ) : null}
            </div>
          )}

          <button
            type="button"
            className="inspector-secondary-action inspector-merge-action"
            disabled={mergeBlockReason != null}
            title={mergeBlockReason ?? 'Merge this line with the next lyric line'}
            onClick={() => {
              if (!selectedLine) return;
              onMergeWithNext(selectedLine.id);
            }}
          >
            Merge with next
          </button>
        </div>
      )}
    </aside>
  );
}
