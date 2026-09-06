import { useState, type FormEvent } from 'react';

type Props = {
  isLoading: boolean;
  error: string | null;
  pendingTitle: string | null;
  onImport: (file: File, lyrics: string) => void;
  onConfirmReplacement: () => void;
  onCancelReplacement: () => void;
};

export function ImportPanel({
  isLoading,
  error,
  pendingTitle,
  onImport,
  onConfirmReplacement,
  onCancelReplacement,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file) onImport(file, lyrics);
  };

  return (
    <section className="import-panel" aria-labelledby="import-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audio + lyrics</p>
          <h2 id="import-title">Load a local track</h2>
        </div>
        <span className="session-badge">Session only</span>
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          Audio file
          <input
            type="file"
            accept="audio/*"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Lyrics
          <textarea
            value={lyrics}
            onChange={(event) => setLyrics(event.target.value)}
            rows={7}
            placeholder={'Paste one lyric line per row\nRepeated lines are preserved'}
            required
          />
        </label>
        <button type="submit" disabled={!file || isLoading}>
          {isLoading ? 'Checking audio…' : 'Load track'}
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {pendingTitle && (
        <div className="replace-confirmation" role="alert">
          <p>
            <strong>{pendingTitle}</strong> is ready. Replacing this track will discard the
            current session.
          </p>
          <div className="button-row">
            <button type="button" onClick={onConfirmReplacement}>
              Replace session
            </button>
            <button type="button" onClick={onCancelReplacement}>
              Keep current track
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
