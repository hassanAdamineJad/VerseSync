import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getMergeLineWithNextBlockReason,
  getSplitLineBlockReason,
  type CompletedSegment,
  type EditorState,
} from "../editor";
import { formatTimecode, parseTimecode } from "../timecode";

type Props = {
  editor: EditorState;
  dragPreviewSegments: CompletedSegment[] | null;
  selectedSegmentCount: number;
  currentTimeMs: number;
  onApply: (lineId: string, startMs: number, endMs: number) => void;
  onRemoveTiming: (lineId: string) => void;
  onMergeWithNext: (lineId: string) => void;
  onSplitLine: (
    lineId: string,
    newLineId: string,
    firstText: string,
    secondText: string,
    splitMs: number,
  ) => void;
};

type FieldErrors = {
  start: string | null;
  end: string | null;
};

type TimingValidationResult =
  | { ok: true; startMs: number; endMs: number }
  | { ok: false; errors: FieldErrors };

type SplitFieldErrors = {
  text: string | null;
  splitTime: string | null;
};

type SplitEditorState = {
  value: string;
  splitTime: string;
  errors: SplitFieldErrors;
} | null;

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
    errors.end = "End must be later than start.";
  }

  if (errors.start || errors.end) return { ok: false, errors };

  return { ok: true, startMs, endMs };
}

function sanitizeTimecodeDraft(value: string): string {
  return value.replace(/[^\d:.]/g, "");
}

function normalizeTimecodeValue(value: string): string | null {
  const parsed = parseTimecode(value);
  return parsed.ok ? formatTimecode(parsed.milliseconds) : null;
}

function getDefaultSplitMs(
  segment: CompletedSegment,
  currentTimeMs: number,
): number {
  if (segment.startMs < currentTimeMs && currentTimeMs < segment.endMs) {
    return currentTimeMs;
  }

  return Math.round((segment.startMs + segment.endMs) / 2);
}

function validateSplitDraft(
  value: string,
  splitTimeInput: string,
  segment: CompletedSegment,
  durationMs: number,
):
  | { ok: true; firstText: string; secondText: string; splitMs: number }
  | { ok: false; errors: SplitFieldErrors } {
  const rawParts = value.split(/\r?\n/);
  const textErrors: SplitFieldErrors = {
    text: null,
    splitTime: null,
  };

  if (rawParts.length !== 2) {
    textErrors.text =
      "Enter exactly two lyric lines separated by one line break.";
  }

  const firstText = rawParts[0]?.trim() ?? "";
  const secondText = rawParts[1]?.trim() ?? "";
  if (!textErrors.text && (!firstText || !secondText)) {
    textErrors.text = "Both lyric parts must contain text.";
  }

  const parsedSplitTime = parseTimecode(splitTimeInput);
  let splitMs: number | null = null;
  if (!parsedSplitTime.ok) {
    textErrors.splitTime = `Split time: ${parsedSplitTime.error}`;
  } else {
    splitMs = parsedSplitTime.milliseconds;
    if (splitMs > durationMs) {
      textErrors.splitTime = `Split time must be no later than ${formatTimecode(durationMs)}.`;
    } else if (splitMs <= segment.startMs || splitMs >= segment.endMs) {
      textErrors.splitTime = "Split time must be strictly inside this segment.";
    }
  }

  if (textErrors.text || textErrors.splitTime) {
    return { ok: false, errors: textErrors };
  }

  return {
    ok: true,
    firstText,
    secondText,
    splitMs: splitMs ?? segment.startMs,
  };
}

export function SegmentInspector({
  editor,
  dragPreviewSegments,
  selectedSegmentCount,
  currentTimeMs,
  onApply,
  onRemoveTiming,
  onMergeWithNext,
  onSplitLine,
}: Props) {
  const selectedLine = editor.document.lines.find(
    (line) => line.id === editor.selectedLineId,
  );
  const segment = selectedLine
    ? (dragPreviewSegments?.find(
        (preview) => preview.lineId === selectedLine.id,
      ) ?? editor.segments[selectedLine.id])
    : undefined;
  const isOpen = selectedLine?.id === editor.openSegment?.lineId;
  const committedStartLabel = segment ? formatTimecode(segment.startMs) : "";
  const committedEndLabel = segment ? formatTimecode(segment.endMs) : "";
  const committedDurationLabel = segment
    ? formatTimecode(segment.endMs - segment.startMs)
    : "";
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({ start: null, end: null });
  const [splitEditor, setSplitEditor] = useState<SplitEditorState>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const splitEditorRef = useRef<HTMLFormElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const splitTextRef = useRef<HTMLTextAreaElement>(null);
  const splitTimeRef = useRef<HTMLInputElement>(null);
  const startErrorId = "segment-inspector-start-error";
  const endErrorId = "segment-inspector-end-error";
  const splitTextErrorId = "segment-inspector-split-text-error";
  const splitTimeErrorId = "segment-inspector-split-time-error";

  useEffect(() => {
    setStartDraft(committedStartLabel);
    setEndDraft(committedEndLabel);
    setErrors({ start: null, end: null });
  }, [committedEndLabel, committedStartLabel, segment?.lineId]);

  useEffect(() => {
    setSplitEditor(null);
  }, [selectedLine?.id, segment?.endMs, segment?.lineId, segment?.startMs]);

  useEffect(() => {
    if (!splitEditor) return;

    const frame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      const editorForm = splitEditorRef.current;
      if (!content || !editorForm) return;

      const contentRect = content.getBoundingClientRect();
      const editorRect = editorForm.getBoundingClientRect();
      const isFullyVisible =
        editorRect.top >= contentRect.top &&
        editorRect.bottom <= contentRect.bottom;

      if (!isFullyVisible) {
        editorForm.scrollIntoView({ block: "nearest" });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [splitEditor]);

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

  const handleDraftChange = (field: "start" | "end", value: string) => {
    const sanitizedValue = sanitizeTimecodeDraft(value);
    if (field === "start") {
      setStartDraft(sanitizedValue);
      if (errors.start) {
        setErrors((current) => ({ ...current, start: null }));
      }
    } else {
      setEndDraft(sanitizedValue);
      if (errors.end) {
        setErrors((current) => ({ ...current, end: null }));
      }
    }
  };

  const normalizeDraftOnBlur = (field: "start" | "end") => {
    const draft = field === "start" ? startDraft : endDraft;
    const normalizedValue = normalizeTimecodeValue(draft);

    if (normalizedValue) {
      if (field === "start") {
        setStartDraft(normalizedValue);
        if (errors.start) {
          setErrors((current) => ({ ...current, start: null }));
        }
      } else {
        setEndDraft(normalizedValue);
        if (errors.end) {
          setErrors((current) => ({ ...current, end: null }));
        }
      }
      return;
    }

    const parsed = parseTimecode(draft);
    const errorMessage = parsed.ok
      ? null
      : `${field === "start" ? "Start" : "End"}: ${parsed.error}`;

    if (field === "start") {
      setErrors((current) => ({ ...current, start: errorMessage }));
    } else {
      setErrors((current) => ({ ...current, end: errorMessage }));
    }
  };

  const applyDisabled =
    !selectedLine || !segment || !startDraft.trim() || !endDraft.trim();
  const mergeBlockReason = getMergeLineWithNextBlockReason(
    editor,
    selectedLine?.id ?? null,
    selectedSegmentCount,
  );
  const splitBlockReason = getSplitLineBlockReason(
    editor,
    selectedLine?.id ?? null,
    selectedSegmentCount,
  );
  const canShowSplitAction = selectedLine != null && segment != null;
  const selectedLinePosition =
    selectedLine != null
      ? `${selectedLine.index + 1} / ${editor.document.lines.length}`
      : null;
  const selectedLineState = isOpen
    ? "Capturing"
    : segment
      ? "Timed"
      : "Untimed";

  const openSplitEditor = () => {
    if (!segment || !selectedLine || splitBlockReason) return;

    setSplitEditor({
      value: selectedLine.text,
      splitTime: formatTimecode(getDefaultSplitMs(segment, currentTimeMs)),
      errors: { text: null, splitTime: null },
    });
  };

  const cancelSplitEditor = () => {
    setSplitEditor(null);
  };

  const submitSplit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!segment || !selectedLine || !splitEditor) return;

    const validation = validateSplitDraft(
      splitEditor.value,
      splitEditor.splitTime,
      segment,
      editor.document.durationMs,
    );
    if (!validation.ok) {
      setSplitEditor((current) =>
        current == null
          ? current
          : {
              ...current,
              errors: validation.errors,
            },
      );
      if (validation.errors.text) {
        splitTextRef.current?.focus();
      } else if (validation.errors.splitTime) {
        splitTimeRef.current?.focus();
      }
      return;
    }

    onSplitLine(
      selectedLine.id,
      crypto.randomUUID(),
      validation.firstText,
      validation.secondText,
      validation.splitMs,
    );
    setSplitEditor(null);
  };

  return (
    <aside className="inspector-panel" aria-labelledby="inspector-title">
      <div className="inspector-header">
        <h2 id="inspector-title">Segment</h2>
        {selectedLinePosition ? <span>{selectedLinePosition}</span> : null}
      </div>

      {!selectedLine && (
        <div className="inspector-empty-state">
          <p>Select a lyric line to inspect its timing.</p>
        </div>
      )}

      {selectedLine && (
        <div ref={contentRef} className="inspector-content">
          <div className="inspector-summary" data-state={selectedLineState.toLowerCase()}>
            <p className="inspector-lyric">{selectedLine.text}</p>
            <div className="inspector-meta">
              <div
                className="inspector-state"
                data-state={selectedLineState.toLowerCase()}
              >
                <span className="inspector-state-dot" aria-hidden="true" />
                <span>{selectedLineState}</span>
              </div>
            </div>
          </div>

          {segment ? (
            <form className="inspector-form" onSubmit={handleSubmit}>
              <div className="timing-fields">
                <label className="timing-field">
                  <span className="timing-field-label">Start</span>
                  <input
                    ref={startRef}
                    type="text"
                    inputMode="text"
                    value={startDraft}
                    onChange={(event) =>
                      handleDraftChange("start", event.target.value)
                    }
                    onBlur={() => normalizeDraftOnBlur("start")}
                    aria-invalid={errors.start ? "true" : "false"}
                    aria-describedby={startErrorId}
                    placeholder="00:13.252"
                  />
                  {errors.start ? (
                    <span
                      id={startErrorId}
                      className="field-error"
                      role="alert"
                    >
                      {errors.start}
                    </span>
                  ) : null}
                </label>
                <label className="timing-field">
                  <span className="timing-field-label">End</span>
                  <input
                    ref={endRef}
                    type="text"
                    inputMode="text"
                    value={endDraft}
                    onChange={(event) =>
                      handleDraftChange("end", event.target.value)
                    }
                    onBlur={() => normalizeDraftOnBlur("end")}
                    aria-invalid={errors.end ? "true" : "false"}
                    aria-describedby={endErrorId}
                    placeholder="00:16.504"
                  />
                  {errors.end ? (
                    <span id={endErrorId} className="field-error" role="alert">
                      {errors.end}
                    </span>
                  ) : null}
                </label>
              </div>
              <div className="timing-readonly-row">
                <span>Duration</span>
                <strong>{committedDurationLabel}</strong>
              </div>
              <div className="inspector-action-stack">
                <button
                  type="submit"
                  className="inspector-apply"
                  disabled={applyDisabled}
                >
                  Apply timing
                </button>
                <div className="inspector-secondary-actions-row">
                  <button
                    type="button"
                    className="inspector-secondary-button inspector-merge-action"
                    disabled={mergeBlockReason != null}
                    title={
                      mergeBlockReason ??
                      "Merge this line with the next lyric line"
                    }
                    onClick={() => {
                      if (!selectedLine) return;
                      onMergeWithNext(selectedLine.id);
                    }}
                  >
                    Merge with next
                  </button>

                  {canShowSplitAction ? (
                    <button
                      type="button"
                      className="inspector-secondary-button inspector-split-action"
                      disabled={splitBlockReason != null}
                      title={
                        splitBlockReason ??
                        "Split this lyric line into two timed lines"
                      }
                      onClick={openSplitEditor}
                    >
                      Split
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inspector-secondary-button inspector-split-action"
                  onClick={() => onRemoveTiming(selectedLine.id)}
                >
                  Remove timing
                </button>
              </div>
            </form>
          ) : (
            <div className="inspector-empty-message">
              <p>
                {isOpen
                  ? "Finish this capture before editing its timing."
                  : "Capture or place this line to edit its timing."}
              </p>
            </div>
          )}

          {!segment ? (
            <div className="inspector-actions">
              <button
                type="button"
                className="inspector-secondary-button inspector-merge-action"
                disabled={mergeBlockReason != null}
                title={
                  mergeBlockReason ?? "Merge this line with the next lyric line"
                }
                onClick={() => {
                  if (!selectedLine) return;
                  onMergeWithNext(selectedLine.id);
                }}
              >
                Merge with next
              </button>
            </div>
          ) : null}

          {canShowSplitAction && splitEditor ? (
            <form
              ref={splitEditorRef}
              className="inspector-split-editor"
              onSubmit={submitSplit}
            >
              <label>
                <span className="timing-field-label">Split lyrics</span>
                <textarea
                  ref={splitTextRef}
                  rows={3}
                  value={splitEditor.value}
                  onChange={(event) =>
                    setSplitEditor((current) =>
                      current == null
                        ? current
                        : {
                            ...current,
                            value: event.target.value,
                            errors: { ...current.errors, text: null },
                          },
                    )
                  }
                  aria-invalid={splitEditor.errors.text ? "true" : "false"}
                  aria-describedby={
                    splitEditor.errors.text ? splitTextErrorId : undefined
                  }
                />
                {splitEditor.errors.text ? (
                  <span
                    id={splitTextErrorId}
                    className="field-error"
                    role="alert"
                  >
                    {splitEditor.errors.text}
                  </span>
                ) : null}
              </label>
              <p className="inspector-split-instruction">
                Divide this lyric into exactly two non-empty lines using one
                line break.
              </p>
              <label>
                <span className="timing-field-label">Split time</span>
                <input
                  ref={splitTimeRef}
                  type="text"
                  inputMode="text"
                  value={splitEditor.splitTime}
                  onChange={(event) =>
                    setSplitEditor((current) =>
                      current == null
                        ? current
                        : {
                            ...current,
                            splitTime: event.target.value,
                            errors: { ...current.errors, splitTime: null },
                          },
                    )
                  }
                  aria-invalid={splitEditor.errors.splitTime ? "true" : "false"}
                  aria-describedby={
                    splitEditor.errors.splitTime ? splitTimeErrorId : undefined
                  }
                />
                {splitEditor.errors.splitTime ? (
                  <span
                    id={splitTimeErrorId}
                    className="field-error"
                    role="alert"
                  >
                    {splitEditor.errors.splitTime}
                  </span>
                ) : null}
              </label>
              <div className="inspector-split-actions">
                <button type="submit" className="inspector-apply">
                  Apply split
                </button>
                <button
                  type="button"
                  className="inspector-secondary-button"
                  onClick={cancelSplitEditor}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      )}
    </aside>
  );
}
