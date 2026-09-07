import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type ShortcutEntry = {
  label: string;
  keys: string[];
};

type ShortcutSection = {
  title: string;
  entries: ShortcutEntry[];
};

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Playback',
    entries: [{ label: 'Play/Pause', keys: ['Space'] }],
  },
  {
    title: 'Capture',
    entries: [
      { label: 'Stamp / Stamp & Next', keys: ['S'] },
      { label: 'Finish Line', keys: ['F'] },
    ],
  },
  {
    title: 'Editing',
    entries: [
      { label: 'Undo', keys: ['Ctrl/Cmd', 'Z'] },
      { label: 'Redo', keys: ['Ctrl/Cmd', 'Shift', 'Z'] },
      { label: 'Redo', keys: ['Ctrl', 'Y'] },
      { label: 'Reorder focused lyric line', keys: ['Alt', 'Arrow Up/Down'] },
      { label: 'Cancel the active editor, drag, or modal where supported', keys: ['Escape'] },
      { label: 'Save inline lyric editing where supported', keys: ['Enter'] },
    ],
  },
  {
    title: 'Timeline',
    entries: [
      { label: 'Multi-select segments', keys: ['Shift', 'Click'] },
      { label: 'Disable snapping while dragging', keys: ['Alt'] },
    ],
  },
];

type Props = {
  onClose: () => void;
};

export function KeyboardShortcutsModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

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
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        <div className="shortcuts-modal-header">
          <h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="shortcuts-modal-close"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.9} />
          </button>
        </div>

        <div className="shortcuts-modal-body">
          {SHORTCUT_SECTIONS.map((section) => (
            <section
              key={section.title}
              className="shortcuts-section"
              aria-labelledby={`shortcuts-${section.title.toLowerCase()}`}
            >
              <h3 id={`shortcuts-${section.title.toLowerCase()}`}>{section.title}</h3>
              <ul className="shortcuts-list">
                {section.entries.map((entry) => (
                  <li key={`${section.title}-${entry.label}-${entry.keys.join('-')}`} className="shortcuts-item">
                    <span>{entry.label}</span>
                    <span className="shortcuts-kbd-group" aria-label={`${entry.keys.join(' plus ')} shortcut`}>
                      {entry.keys.map((key, index) => (
                        <span key={`${entry.label}-${key}`}>
                          {index > 0 ? <span className="shortcuts-plus" aria-hidden="true">+</span> : null}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
