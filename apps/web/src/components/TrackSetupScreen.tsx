import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  getLocalAudioFileError,
  getLyricInputError,
  getNormalizedLyricTexts,
  LYRIC_LIMIT_COUNTER_RATIO,
  MAX_LYRIC_CHARACTERS,
  MAX_LYRIC_LINE_CHARACTERS,
  MAX_LYRIC_LINES,
  secondsToMilliseconds,
} from "../editor";

const PREVIEW_LOOP_MS = 15_400;
const PREVIEW_VIEWPORT_MS = 8_000;
const PREVIEW_PLAYHEAD_RATIO = 0.42;
const PREVIEW_PREROLL_MS = Math.round(
  PREVIEW_VIEWPORT_MS * PREVIEW_PLAYHEAD_RATIO,
);
const PREVIEW_POSTROLL_MS = PREVIEW_VIEWPORT_MS - PREVIEW_PREROLL_MS;
const PREVIEW_CONTENT_START_MS = -PREVIEW_PREROLL_MS;
const PREVIEW_CONTENT_END_MS = PREVIEW_LOOP_MS + PREVIEW_POSTROLL_MS;
const PREVIEW_CONTENT_DURATION_MS =
  PREVIEW_CONTENT_END_MS - PREVIEW_CONTENT_START_MS;
const PREVIEW_VIEWBOX_WIDTH = 1000;
const PREVIEW_VIEWBOX_HEIGHT = 84;
const PREVIEW_WAVEFORM_STRIP_WIDTH =
  (PREVIEW_CONTENT_DURATION_MS / PREVIEW_VIEWPORT_MS) * PREVIEW_VIEWBOX_WIDTH;
const PREVIEW_PLAYHEAD_PERCENT = PREVIEW_PLAYHEAD_RATIO * 100;
const PREVIEW_WAVE_BAR_COUNT = 180;
const PREVIEW_TRACK_TITLE = "You Verse You";
const PREVIEW_LINES = [
  {
    id: "line-1",
    text: "You alone it's cold and raining but you go and train",
  },
  {
    id: "line-2",
    text: "Put the headset on and go with the flow and show no pain",
  },
  {
    id: "line-3",
    text: "You won't quit you keep on going with the flow again",
  },
  {
    id: "line-4",
    text: "Next thing you know you're at 150 pushups and still ain't slain",
  },
] as const;
const PREVIEW_SEGMENTS = [
  { id: "segment-1", lineId: PREVIEW_LINES[0].id, startMs: 0, endMs: 2_900 },
  {
    id: "segment-2",
    lineId: PREVIEW_LINES[1].id,
    startMs: 2_900,
    endMs: 6_100,
  },
  {
    id: "segment-3",
    lineId: PREVIEW_LINES[2].id,
    startMs: 6_100,
    endMs: 9_500,
  },
  {
    id: "segment-4",
    lineId: PREVIEW_LINES[3].id,
    startMs: 9_500,
    endMs: 12_800,
  },
] as const;

type PreviewWaveBar = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function formatPreviewTimer(milliseconds: number): string {
  const safeMs = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

type Props = {
  mode?: "initial" | "replacement";
  isLoading: "seeded" | "local" | null;
  importError: string | null;
  seededError: string | null;
  pendingTitle?: string | null;
  onImport: (file: File, lyrics: string) => void;
  onTrySample: () => void;
  onConfirmReplacement?: () => void;
  onCancelReplacement?: () => void;
  onCancel?: () => void;
};

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioKind(file: File): string | null {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()
    : undefined;
  if (extension && /^[a-z0-9]+$/i.test(extension)) {
    return extension.toUpperCase();
  }
  if (!file.type.startsWith("audio/")) return file.type || null;

  const subtype = file.type.slice("audio/".length).toUpperCase();
  if (subtype === "MPEG" || subtype === "X-MPEG" || subtype === "MP3") {
    return "MP3";
  }
  if (subtype === "WAV" || subtype === "WAVE" || subtype === "X-WAV") {
    return "WAV";
  }
  return subtype.replace(/^X-/, "") || null;
}

function formatAudioDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSelectedAudioMeta(
  file: File,
  durationMs: number | null,
): string {
  const parts = [formatFileSize(file.size)];
  const kind = formatAudioKind(file);
  if (kind) parts.push(kind);
  if (durationMs != null && durationMs > 0) {
    parts.push(formatAudioDuration(durationMs));
  }
  return parts.join(" · ");
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

const SETUP_FILE_WAVE_BAR_COUNT = 56;
const SETUP_FILE_WAVE_VIEWBOX_WIDTH = 240;
const SETUP_FILE_WAVE_VIEWBOX_HEIGHT = 22;

type SetupFileWaveBar = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function getSetupFileWaveBars(seed: string): SetupFileWaveBar[] {
  const gap = 1.6;
  const barWidth =
    (SETUP_FILE_WAVE_VIEWBOX_WIDTH - gap * (SETUP_FILE_WAVE_BAR_COUNT - 1)) /
    SETUP_FILE_WAVE_BAR_COUNT;

  return Array.from({ length: SETUP_FILE_WAVE_BAR_COUNT }, (_, index) => {
    const amplitude =
      0.2 +
      Math.abs(Math.sin((index + seed.length) * 0.41) * 0.4) +
      Math.abs(Math.cos((index + 3) * 0.17) * 0.22);
    const height = 4 + amplitude * (SETUP_FILE_WAVE_VIEWBOX_HEIGHT - 5);
    return {
      id: `setup-file-wave-${index}`,
      x: index * (barWidth + gap),
      y: (SETUP_FILE_WAVE_VIEWBOX_HEIGHT - height) / 2,
      width: barWidth,
      height,
    };
  });
}

export function TrackSetupScreen({
  mode = "initial",
  isLoading,
  importError,
  seededError,
  pendingTitle = null,
  onImport,
  onTrySample,
  onConfirmReplacement,
  onCancelReplacement,
  onCancel,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [previewElapsedMs, setPreviewElapsedMs] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const audioErrorId = useId();
  const lyricsErrorId = useId();
  const previewGradientId = `setup-preview-waveform-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const normalizedLyricLines = useMemo(
    () => getNormalizedLyricTexts(lyrics),
    [lyrics],
  );
  const lyricsError = useMemo(() => getLyricInputError(lyrics), [lyrics]);
  const detectedLineCount = normalizedLyricLines.length;
  const longestLineCharacters = useMemo(
    () =>
      normalizedLyricLines.reduce(
        (longest, line) => Math.max(longest, line.length),
        0,
      ),
    [normalizedLyricLines],
  );
  const canOpenWorkspace =
    file != null &&
    lyricsError == null &&
    detectedLineCount > 0 &&
    isLoading == null;
  const showCharacterCounter =
    lyrics.length >= MAX_LYRIC_CHARACTERS * LYRIC_LIMIT_COUNTER_RATIO;
  const showLineCounter =
    detectedLineCount >= MAX_LYRIC_LINES * LYRIC_LIMIT_COUNTER_RATIO;
  const showLineLengthCounter =
    longestLineCharacters >=
    MAX_LYRIC_LINE_CHARACTERS * LYRIC_LIMIT_COUNTER_RATIO;
  const showLyricCounter =
    showCharacterCounter || showLineCounter || showLineLengthCounter;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (file == null) {
      setAudioDurationMs(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";

    const detach = () => {
      probe.removeEventListener("loadedmetadata", handleMetadata);
      probe.removeEventListener("error", handleError);
      probe.removeAttribute("src");
      probe.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    function handleMetadata() {
      if (!cancelled) {
        const durationMs = secondsToMilliseconds(probe.duration);
        setAudioDurationMs(
          Number.isFinite(probe.duration) && durationMs > 0 ? durationMs : null,
        );
      }
      detach();
    }

    function handleError() {
      if (!cancelled) setAudioDurationMs(null);
      detach();
    }

    probe.addEventListener("loadedmetadata", handleMetadata);
    probe.addEventListener("error", handleError);
    probe.src = objectUrl;

    return () => {
      cancelled = true;
      detach();
    };
  }, [file]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setPreviewElapsedMs(10_800);
      return;
    }

    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      setPreviewElapsedMs((now - startTime) % PREVIEW_LOOP_MS);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [prefersReducedMotion]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || lyricsError != null || detectedLineCount === 0) return;
    onImport(file, lyrics);
  };

  const isReplacementMode = mode === "replacement";
  const title = isReplacementMode
    ? "Replace the track for this session."
    : "Time every lyric to the beat.";
  const copy = isReplacementMode
    ? "Choose a track, paste one lyric per line, then replace this session."
    : "Choose a track, paste one lyric per line, then start timing.";
  const demoTimeMs = prefersReducedMotion ? 10_800 : previewElapsedMs;
  const visibleStartMs = demoTimeMs - PREVIEW_PREROLL_MS;
  const previewWaveBars = useMemo(
    () =>
      Array.from(
        { length: PREVIEW_WAVE_BAR_COUNT },
        (_, index): PreviewWaveBar => {
          const progress = index / Math.max(PREVIEW_WAVE_BAR_COUNT - 1, 1);
          const amplitude =
            0.16 +
            Math.abs(
              Math.sin((index + 1) * 0.29) * 0.24 +
                Math.cos((index + 1) * 0.13) * 0.18 +
                Math.sin((index + 1) * 0.71) * 0.1,
            );
          const x = progress * PREVIEW_WAVEFORM_STRIP_WIDTH;
          const height = 8 + amplitude * 34;
          return {
            id: `preview-wave-${index}`,
            x,
            y: (PREVIEW_VIEWBOX_HEIGHT - height) / 2,
            width: 4,
            height,
          };
        },
      ),
    [],
  );
  const activePreviewLineIndex = PREVIEW_SEGMENTS.reduce((activeIndex, segment, index) => {
    if (demoTimeMs >= segment.startMs) return index;
    return activeIndex;
  }, 0);
  const previewLyricRows = PREVIEW_LINES.map((line, index) => ({
    id: line.id,
    text: line.text,
    offset: index - activePreviewLineIndex,
  })).filter((line) => line.offset >= -1 && line.offset <= 2);
  const positionedWaveBars = previewWaveBars.reduce<PreviewWaveBar[]>(
    (bars, bar) => {
      const leftPx =
        (((bar.x / PREVIEW_WAVEFORM_STRIP_WIDTH) * PREVIEW_CONTENT_DURATION_MS +
          PREVIEW_CONTENT_START_MS -
          visibleStartMs) /
          PREVIEW_VIEWPORT_MS) *
        PREVIEW_VIEWBOX_WIDTH;
      const rightPx = leftPx + bar.width;
      if (rightPx < 0 || leftPx > PREVIEW_VIEWBOX_WIDTH) return bars;
      bars.push({ ...bar, x: leftPx });
      return bars;
    },
    [],
  );
  const previewTimelineStyle = {
    "--preview-playhead-percent": `${PREVIEW_PLAYHEAD_PERCENT}%`,
    "--preview-active-lyric-shift": `${activePreviewLineIndex * 4.05}rem`,
  } as CSSProperties;
  const previewTimer = formatPreviewTimer(demoTimeMs);
  const previewTotalTimer = formatPreviewTimer(PREVIEW_LOOP_MS);

  const clearRejectedFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelection = (nextFile: File | null) => {
    setIsDragActive(false);
    if (nextFile == null) return;

    const nextError = getLocalAudioFileError(nextFile);
    if (nextError) {
      setAudioError(nextError);
      clearRejectedFileInput();
      return;
    }

    setAudioError(null);
    setAudioDurationMs(null);
    setFile(nextFile);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    handleFileSelection(event.dataTransfer.files?.[0] ?? null);
  };

  const openFilePicker = () => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const handleAudioDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleAudioDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleAudioDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragActive(false);
  };

  return (
    <main className="setup-shell">
      <section className="setup-card" aria-labelledby="setup-title">
        <div className="setup-column setup-column-form">
          <div className="setup-brand">
            <img
              className="setup-brand-mark"
              src="/icon.png"
              alt=""
              aria-hidden="true"
            />
            <div className="setup-brand-copy">
              <p className="setup-kicker">VerseSync</p>
              <h1 id="setup-title">{title}</h1>
            </div>
          </div>

          <p className="setup-copy">{copy}</p>

          <form className="setup-form" onSubmit={handleSubmit}>
            <section
              className="setup-form-row"
              aria-labelledby="setup-audio-title"
            >
              <p className="setup-form-index" aria-hidden="true">
                01
              </p>
              <div className="setup-file-field">
                <h2 id="setup-audio-title" className="sr-only">
                  Audio
                </h2>
                <div
                  className={`setup-file-row${isDragActive ? " is-active" : ""}${file ? " has-file" : ""}`}
                  onDragEnter={handleAudioDragEnter}
                  onDragOver={handleAudioDragOver}
                  onDragLeave={handleAudioDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    id={fileInputId}
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    tabIndex={file ? -1 : undefined}
                    aria-label="Select an audio file"
                    aria-invalid={audioError ? "true" : "false"}
                    aria-describedby={audioError ? audioErrorId : undefined}
                    onChange={(event) =>
                      handleFileSelection(event.target.files?.[0] ?? null)
                    }
                  />
                  {file ? (
                    <div className="setup-file-selected">
                      <div className="setup-file-selected-header">
                        <p className="setup-file-name" title={file.name}>
                          {file.name}
                        </p>
                        <button
                          type="button"
                          className="setup-file-change"
                          onClick={openFilePicker}
                        >
                          Change
                        </button>
                      </div>
                      <p className="setup-file-selected-meta">
                        {formatSelectedAudioMeta(file, audioDurationMs)}
                      </p>
                      <div className="setup-file-waveform" aria-hidden="true">
                        <svg
                          viewBox={`0 0 ${SETUP_FILE_WAVE_VIEWBOX_WIDTH} ${SETUP_FILE_WAVE_VIEWBOX_HEIGHT}`}
                          preserveAspectRatio="none"
                        >
                          {getSetupFileWaveBars(file.name).map((bar) => (
                            <rect
                              key={bar.id}
                              x={bar.x}
                              y={bar.y}
                              width={bar.width}
                              height={bar.height}
                              rx="0.7"
                            />
                          ))}
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor={fileInputId} className="setup-file-empty">
                      <span className="setup-file-row-copy">
                        <span className="setup-file-row-action">
                          Choose audio
                        </span>
                        <span className="setup-file-row-hint">
                          or drop it here
                        </span>
                      </span>
                    </label>
                  )}
                </div>
                {audioError ? (
                  <p
                    id={audioErrorId}
                    className="setup-field-error"
                    role="alert"
                  >
                    {audioError}
                  </p>
                ) : null}
              </div>
              <span className={`setup-form-status${file ? " is-ready" : ""}`}>
                {file ? "Ready" : "Required"}
              </span>
            </section>

            <section
              className="setup-form-row setup-form-row-lyrics"
              aria-labelledby="setup-lyrics-title"
            >
              <p className="setup-form-index" aria-hidden="true">
                02
              </p>
              <div className="setup-lyrics-row">
                <h2 id="setup-lyrics-title" className="sr-only">
                  Lyrics
                </h2>
                <label className="setup-textarea-field">
                  <span className="sr-only">Lyric lines</span>
                  <textarea
                    value={lyrics}
                    onChange={(event) => setLyrics(event.target.value)}
                    rows={5}
                    aria-label="Lyric lines"
                    aria-invalid={lyricsError ? "true" : "false"}
                    aria-describedby={lyricsError ? lyricsErrorId : undefined}
                    placeholder="Paste lyrics — one line per row"
                  />
                </label>
                {showLyricCounter ? (
                  <p className="setup-lyrics-counter">
                    {showCharacterCounter ? (
                      <span>
                        {formatCount(lyrics.length)} /{" "}
                        {formatCount(MAX_LYRIC_CHARACTERS)} characters
                      </span>
                    ) : null}
                    {showLineCounter ? (
                      <span>
                        {formatCount(detectedLineCount)} /{" "}
                        {formatCount(MAX_LYRIC_LINES)} lines
                      </span>
                    ) : null}
                    {showLineLengthCounter ? (
                      <span>
                        {formatCount(longestLineCharacters)} /{" "}
                        {formatCount(MAX_LYRIC_LINE_CHARACTERS)} per line
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <p className="setup-muted">Blank lines are ignored.</p>
                {lyricsError ? (
                  <p
                    id={lyricsErrorId}
                    className="setup-field-error"
                    role="alert"
                  >
                    {lyricsError}
                  </p>
                ) : null}
              </div>
              <span
                className={`setup-form-status${
                  lyricsError == null && detectedLineCount > 0 ? " is-ready" : ""
                }`}
              >
                {detectedLineCount > 0
                  ? `${detectedLineCount} line${detectedLineCount === 1 ? "" : "s"}`
                  : "Required"}
              </span>
            </section>

            <div className="setup-footer">
              <div className="setup-note">
                <strong>Session only</strong>
                <span>Audio and lyrics stay in this browser session.</span>
              </div>

              {seededError ? (
                <p
                  className="setup-feedback setup-feedback-warning"
                  role="alert"
                >
                  {seededError}
                </p>
              ) : null}
              {importError ? (
                <p className="setup-feedback setup-feedback-error" role="alert">
                  {importError}
                </p>
              ) : null}
              {pendingTitle && onConfirmReplacement && onCancelReplacement ? (
                <div className="replace-confirmation" role="alert">
                  <div>
                    <p>
                      <strong>{pendingTitle}</strong> is ready. Replacing this
                      track will discard the current session.
                    </p>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={onConfirmReplacement}>
                      Replace session
                    </button>
                    <button type="button" onClick={onCancelReplacement}>
                      Keep current track
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="setup-actions">
                <div className="setup-actions-secondary">
                  {isReplacementMode && onCancel ? (
                    <button
                      type="button"
                      className="setup-cancel-button"
                      onClick={onCancel}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="setup-secondary-button"
                    onClick={onTrySample}
                    disabled={isLoading != null}
                  >
                    {isLoading === "seeded" ? "Loading sample…" : "Try sample"}
                  </button>
                  <button
                    type="submit"
                    className="setup-primary-button"
                    disabled={!canOpenWorkspace}
                  >
                    {isLoading === "local" ? "Checking audio…" : "Start timing"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        <aside className="setup-column setup-column-preview" aria-hidden="true">
          <div className="setup-preview-frame">
            <div className="setup-preview-stage">
              <div className="setup-preview-toolbar">
                <p className="setup-preview-track">{PREVIEW_TRACK_TITLE}</p>
                <div className="setup-preview-clock">
                  <span>{previewTimer} / {previewTotalTimer}</span>
                </div>
              </div>

              <div className="setup-preview-player" style={previewTimelineStyle}>
                <div className="setup-preview-waveform-shell">
                  <div className="setup-preview-wavehead" />
                  <div className="setup-preview-waveform-band">
                    <svg
                      className="setup-preview-waveform-svg"
                      viewBox={`0 0 ${PREVIEW_VIEWBOX_WIDTH} ${PREVIEW_VIEWBOX_HEIGHT}`}
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient
                          id={previewGradientId}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="0%"
                        >
                          <stop
                            offset="0%"
                            stopColor="#f3c97a"
                            stopOpacity="0.46"
                          />
                          <stop
                            offset={`${PREVIEW_PLAYHEAD_PERCENT}%`}
                            stopColor="#f3c97a"
                            stopOpacity="0.46"
                          />
                          <stop
                            offset={`${PREVIEW_PLAYHEAD_PERCENT}%`}
                            stopColor="#78716c"
                            stopOpacity="0.34"
                          />
                          <stop
                            offset="100%"
                            stopColor="#78716c"
                            stopOpacity="0.34"
                          />
                        </linearGradient>
                      </defs>
                      <g
                        className="setup-preview-waveform-bars"
                        fill={`url(#${previewGradientId})`}
                      >
                        {positionedWaveBars.map((bar) => (
                          <rect
                            key={bar.id}
                            x={bar.x}
                            y={bar.y}
                            width={bar.width}
                            height={bar.height}
                            rx="1.5"
                          />
                        ))}
                      </g>
                    </svg>
                  </div>
                </div>

                <div className="setup-preview-lyrics">
                  <div className="setup-preview-lyrics-stack">
                    {previewLyricRows.map((line) => (
                      <p
                        key={line.id}
                        className={`setup-preview-line${line.offset === 0 ? " is-current" : line.offset < 0 ? " is-before" : " is-after"}`}
                        data-distance={Math.abs(line.offset)}
                        style={{ "--preview-line-offset": line.offset } as CSSProperties}
                      >
                        {line.text}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="setup-preview-footer">
                <span>Synced preview</span>
                <span>Seeded sample</span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
