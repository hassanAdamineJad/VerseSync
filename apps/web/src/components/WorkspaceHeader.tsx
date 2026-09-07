import type { Ref } from 'react';
import { Download, Keyboard, Redo2, Undo2 } from 'lucide-react';
import { formatTime } from '../editor';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

type Props = {
  keyboardShortcutsButtonRef: Ref<HTMLButtonElement>;
  trackTitle: string;
  sourceLabel: string;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  isPlaybackReady: boolean;
  playbackError: string | null;
  playbackRate: number;
  exportDisabled: boolean;
  undoDisabled: boolean;
  redoDisabled: boolean;
  onTogglePlayback: () => void;
  onPlaybackRateChange: (nextRate: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenKeyboardShortcuts: () => void;
  onExportLrc: () => void;
  onChangeTrack: () => void;
};

export function WorkspaceHeader({
  keyboardShortcutsButtonRef,
  trackTitle,
  sourceLabel,
  currentTimeMs,
  durationMs,
  isPlaying,
  isPlaybackReady,
  playbackError,
  playbackRate,
  exportDisabled,
  undoDisabled,
  redoDisabled,
  onTogglePlayback,
  onPlaybackRateChange,
  onUndo,
  onRedo,
  onOpenKeyboardShortcuts,
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
            <label className="toolbar-speed">
              <span className="sr-only">Playback speed</span>
              <select
                aria-label="Playback speed"
                value={String(playbackRate)}
                onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
                disabled={!isPlaybackReady}
              >
                {PLAYBACK_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
            <div className="toolbar-time">
              <span>Current / total</span>
              <strong>
                {formatTime(currentTimeMs)} / {formatTime(durationMs)}
              </strong>
            </div>
          </div>
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
            ref={keyboardShortcutsButtonRef}
            type="button"
            className="toolbar-history-button"
            onClick={onOpenKeyboardShortcuts}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard aria-hidden="true" size={16} strokeWidth={1.9} />
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
