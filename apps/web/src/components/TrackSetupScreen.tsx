import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { parsePastedLyrics } from '../editor';

const WAVE_CLUSTERS = [
  [0.12, 0.16, 0.14, 0.18, 0.13, 0.15],
  [0.22, 0.28, 0.34, 0.3, 0.24, 0.2],
  [0.18, 0.22, 0.27, 0.24, 0.21, 0.17],
  [0.1, 0.14, 0.12, 0.16, 0.11, 0.09],
  [0.26, 0.32, 0.45, 0.56, 0.42, 0.28],
  [0.2, 0.26, 0.3, 0.27, 0.22, 0.18],
  [0.09, 0.12, 0.1, 0.14, 0.11, 0.08],
  [0.16, 0.21, 0.26, 0.24, 0.19, 0.15],
  [0.24, 0.34, 0.46, 0.52, 0.39, 0.27],
  [0.18, 0.24, 0.28, 0.23, 0.19, 0.14],
  [0.1, 0.12, 0.11, 0.14, 0.1, 0.08],
  [0.14, 0.18, 0.22, 0.2, 0.16, 0.12],
];
const BAR_WIDTH = 6;
const STRIP_WIDTH = 1920;
const WAVE_CENTER_Y = 220;
const WAVE_HEIGHT = 440;

type Props = {
  isLoading: 'seeded' | 'local' | null;
  importError: string | null;
  seededError: string | null;
  onImport: (file: File, lyrics: string) => void;
  onTrySample: () => void;
};

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackSetupScreen({
  isLoading,
  importError,
  seededError,
  onImport,
  onTrySample,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState('');
  const parsedLyrics = useMemo(() => parsePastedLyrics(lyrics), [lyrics]);
  const detectedLineCount = parsedLyrics.ok ? parsedLyrics.lines.length : 0;
  const canOpenWorkspace = file != null && parsedLyrics.ok && isLoading == null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !parsedLyrics.ok) return;
    onImport(file, lyrics);
  };

  return (
    <main className="setup-shell">
      <div className="setup-wave-layer" aria-hidden="true">
        <div className="setup-wave-canvas">
          <div className="setup-wave-scroll-track">
            {[0, 1].map((stripIndex) => (
              <svg
                key={stripIndex}
                className="setup-wave-strip"
                viewBox={`0 0 ${STRIP_WIDTH} ${WAVE_HEIGHT}`}
                preserveAspectRatio="none"
              >
                {WAVE_CLUSTERS.map((cluster, clusterIndex) => {
                  const clusterWidth = STRIP_WIDTH / WAVE_CLUSTERS.length;
                  const barGap = clusterWidth / cluster.length;

                  return (
                    <g
                      key={`${stripIndex}-${clusterIndex}`}
                      transform={`translate(${clusterIndex * clusterWidth} ${WAVE_CENTER_Y})`}
                    >
                      <g
                        className={`setup-wave-cluster${clusterIndex % 2 === 1 ? ' is-delayed' : ''}`}
                        style={
                          {
                            '--cluster-duration': `${12 + (clusterIndex % 4) * 2}s`,
                            '--cluster-delay': `-${clusterIndex * 0.9}s`,
                            '--cluster-scale-min': `${0.9 + (clusterIndex % 3) * 0.03}`,
                            '--cluster-scale-max': `${1.06 + (clusterIndex % 4) * 0.05}`,
                          } as CSSProperties
                        }
                      >
                        {cluster.map((amplitude, barIndex) => {
                          const height = 30 + amplitude * 210;
                          return (
                            <rect
                              key={`${stripIndex}-${clusterIndex}-${barIndex}`}
                              className={`setup-wave-bar${amplitude > 0.38 ? ' is-peak' : amplitude > 0.22 ? ' is-mid' : ''}`}
                              x={barIndex * barGap + (barGap - BAR_WIDTH) / 2}
                              y={-height / 2}
                              width={BAR_WIDTH}
                              height={height}
                              rx={BAR_WIDTH / 2}
                            />
                          );
                        })}
                      </g>
                    </g>
                  );
                })}
              </svg>
            ))}
          </div>
          <div className="setup-wave-pulse-band" />
        </div>
      </div>
      <section className="setup-card" aria-labelledby="setup-title">
        <div className="setup-brand">
          <span className="setup-brand-mark" aria-hidden="true">
            V
          </span>
          <div>
            <p className="setup-kicker">VerseSync</p>
            <h1 id="setup-title">Load a track to begin timing lyrics.</h1>
          </div>
        </div>

        <p className="setup-copy">
          Import a local audio file and paste lyric lines, or jump into the existing sample
          track. Edits stay in this browser session.
        </p>

        <form className="setup-grid" onSubmit={handleSubmit}>
          <section className="setup-panel" aria-labelledby="setup-audio-title">
            <div className="setup-panel-heading">
              <div>
                <p className="setup-panel-step">1. Audio track</p>
                <h2 id="setup-audio-title">Choose local audio</h2>
              </div>
              {file ? <span className="setup-chip">Ready</span> : null}
            </div>

            <label className="setup-file-picker">
              <span>Select an audio file</span>
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {file ? (
              <dl className="setup-file-meta">
                <div>
                  <dt>File</dt>
                  <dd title={file.name}>{file.name}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatFileSize(file.size)}</dd>
                </div>
                {file.type ? (
                  <div>
                    <dt>Type</dt>
                    <dd>{file.type}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="setup-muted">Choose a browser-supported local audio file.</p>
            )}
          </section>

          <section className="setup-panel" aria-labelledby="setup-lyrics-title">
            <div className="setup-panel-heading">
              <div>
                <p className="setup-panel-step">2. Lyrics</p>
                <h2 id="setup-lyrics-title">Paste lyric lines</h2>
              </div>
              <span className="setup-chip">
                {parsedLyrics.ok ? `${detectedLineCount} lines ready` : 'Add at least 1 line'}
              </span>
            </div>

            <label>
              <span className="sr-only">Lyric lines</span>
              <textarea
                value={lyrics}
                onChange={(event) => setLyrics(event.target.value)}
                rows={8}
                placeholder={'Paste one lyric line per row\nRepeated lines are preserved'}
              />
            </label>

            <p className="setup-muted">
              Blank lines are ignored. Repeated lyric lines stay distinct and keep stable IDs.
            </p>
          </section>

          <div className="setup-footer">
            <div className="setup-note">
              <strong>Session only</strong>
              <span>
                Audio, lyrics, and timing edits stay local to this browser session in this
                milestone.
              </span>
            </div>

            {seededError ? (
              <p className="setup-feedback setup-feedback-warning" role="alert">
                {seededError}
              </p>
            ) : null}
            {importError ? (
              <p className="setup-feedback setup-feedback-error" role="alert">
                {importError}
              </p>
            ) : null}

            <div className="setup-actions">
              <button
                type="button"
                className="setup-secondary-button"
                onClick={onTrySample}
                disabled={isLoading != null}
              >
                {isLoading === 'seeded' ? 'Loading sample…' : 'Try sample track'}
              </button>
              <button
                type="submit"
                className="setup-primary-button"
                disabled={!canOpenWorkspace}
              >
                {isLoading === 'local' ? 'Checking audio…' : 'Open timing workspace'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
