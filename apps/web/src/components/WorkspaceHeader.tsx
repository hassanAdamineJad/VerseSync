import { Download, Redo2, Undo2 } from 'lucide-react';
import { formatTime } from '../editor';

type Props = {
  trackTitle: string;
  sourceLabel: string;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  isPlaybackReady: boolean;
  playbackError: string | null;
  exportDisabled: boolean;
  undoDisabled: boolean;
  redoDisabled: boolean;
  onTogglePlayback: () => void;
  onSeek: (nextMs: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportLrc: () => void;
  onChangeTrack: () => void;
};

export function WorkspaceHeader({
  trackTitle,
  sourceLabel,
  currentTimeMs,
  durationMs,
  isPlaying,
  isPlaybackReady,
  playbackError,
  exportDisabled,
  undoDisabled,
  redoDisabled,
  onTogglePlayback,
  onSeek,
  onUndo,
  onRedo,
  onExportLrc,
  onChangeTrack,
}: Props) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">V</span>
        <div className="brand-copy">
          <span className="brand-name">VerseSync</span>
          <p className="eyebrow">Lyric timing workspace</p>
        </div>
      </div>
      <div className="toolbar-track">
        <div>
          <strong>{trackTitle}</strong>
          <div className="toolbar-track-meta">
            <span className="source-badge">{sourceLabel}</span>
            <small>Session only</small>
          </div>
        </div>
      </div>
      <div className="toolbar-actions">
        <div className="toolbar-transport">
          <div className="toolbar-transport-row">
            <button
              type="button"
              className="toolbar-playback-button"
              onClick={onTogglePlayback}
              disabled={!isPlaybackReady}
            >
              {isPlaying ? 'Pause' : 'Play'}
              <kbd>Space</kbd>
            </button>
            <div className="toolbar-time">
              <span>Current / total</span>
              <strong>
                {formatTime(currentTimeMs)} / {formatTime(durationMs)}
              </strong>
            </div>
          </div>
          <label className="toolbar-seek">
            <span className="sr-only">Seek through audio</span>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={1}
              value={Math.min(currentTimeMs, durationMs)}
              onChange={(event) => onSeek(Number(event.target.value))}
              disabled={!isPlaybackReady}
            />
          </label>
          {playbackError ? (
            <p className="toolbar-playback-error" role="alert">
              {playbackError}
            </p>
          ) : null}
        </div>
        <div className="toolbar-action-buttons">
          <button
            type="button"
            className="toolbar-history-button"
            onClick={onUndo}
            disabled={undoDisabled}
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 aria-hidden="true" size={16} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="toolbar-history-button"
            onClick={onRedo}
            disabled={redoDisabled}
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z, Ctrl+Y)"
          >
            <Redo2 aria-hidden="true" size={16} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="toolbar-export-button"
            onClick={onExportLrc}
            disabled={exportDisabled}
          >
            <Download aria-hidden="true" size={16} strokeWidth={1.9} />
            <span>Export LRC</span>
          </button>
          <button type="button" className="toolbar-change-button" onClick={onChangeTrack}>
            Change track
          </button>
        </div>
      </div>
    </header>
  );
}
