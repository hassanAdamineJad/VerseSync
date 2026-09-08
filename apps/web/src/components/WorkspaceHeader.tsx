import type { Ref } from 'react';
import { Download, Keyboard, Pause, Play, Redo2, Undo2 } from 'lucide-react';
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
  const progressPercent = durationMs <= 0 ? 0 : Math.min(Math.max((currentTimeMs / durationMs) * 100, 0), 100);

  return (
    <header className="app-header">
      <div className="toolbar-left">
        <div className="brand">
          <img className="brand-mark" src="/icon.png" alt="" aria-hidden="true" />
          <div className="brand-copy">
            <span className="brand-name">VerseSync</span>
          </div>
        </div>
        <div className="toolbar-track">
          <div>
            <strong>{trackTitle}</strong>
            <div className="toolbar-track-meta">
              <small>{formatTime(durationMs)}</small>
              <span className="source-badge">{sourceLabel}</span>
              <small>Session only</small>
            </div>
          </div>
        </div>
        <button type="button" className="toolbar-change-button" onClick={onChangeTrack}>
          Change track
        </button>
        <button
          type="button"
          className="toolbar-playback-button"
          onClick={onTogglePlayback}
          disabled={!isPlaybackReady}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={`${isPlaying ? 'Pause' : 'Play'} (Space)`}
        >
          {isPlaying ? <Pause aria-hidden="true" size={14} strokeWidth={2} /> : <Play aria-hidden="true" size={14} strokeWidth={2} />}
        </button>
        <div className="toolbar-time">
          <strong>
            {formatTime(currentTimeMs)} / {formatTime(durationMs)}
          </strong>
        </div>
        <span className="toolbar-shortcut-hint">Space</span>
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
        {playbackError ? (
          <p className="toolbar-playback-error" role="alert">
            {playbackError}
          </p>
        ) : null}
      </div>
      <div className="toolbar-right">
        <button
          type="button"
          className="toolbar-text-icon-button"
          onClick={onUndo}
          disabled={undoDisabled}
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 aria-hidden="true" size={15} strokeWidth={1.9} />
          <span>Undo</span>
        </button>
        <button
          type="button"
          className="toolbar-text-icon-button"
          onClick={onRedo}
          disabled={redoDisabled}
          aria-label="Redo"
          title="Redo (Ctrl/Cmd+Shift+Z, Ctrl+Y)"
        >
          <Redo2 aria-hidden="true" size={15} strokeWidth={1.9} />
          <span>Redo</span>
        </button>
        <button
          ref={keyboardShortcutsButtonRef}
          type="button"
          className="toolbar-text-icon-button"
          onClick={onOpenKeyboardShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard aria-hidden="true" size={15} strokeWidth={1.9} />
          <span>Help</span>
        </button>
        <button
          type="button"
          className="toolbar-export-button"
          onClick={onExportLrc}
          disabled={exportDisabled}
        >
          <Download aria-hidden="true" size={15} strokeWidth={1.9} />
          <span>Export LRC</span>
        </button>
      </div>
      <div className="toolbar-progress" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </header>
  );
}
