import { useEffect, useRef } from 'react';

type Options = {
  transportEnabled: boolean;
  canStamp: boolean;
  canFinish: boolean;
  onTogglePlayback: () => void;
  onStamp: () => void;
  onFinish: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHelp: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') != null
  );
}

function isDialogBlockingShortcuts(target: EventTarget | null): boolean {
  if (document.querySelector('[aria-modal="true"]')) return true;
  return (
    target instanceof Element &&
    target.closest('[role="dialog"], [role="alertdialog"]') != null
  );
}

function isSpaceActivatableControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLButtonElement) return !target.disabled;
  if (target instanceof HTMLAnchorElement) return target.hasAttribute('href');
  return (
    target.getAttribute('role') === 'button' && target.getAttribute('aria-disabled') !== 'true'
  );
}

export function useWorkspaceKeyboardShortcuts({
  transportEnabled,
  canStamp,
  canFinish,
  onTogglePlayback,
  onStamp,
  onFinish,
  onUndo,
  onRedo,
  onOpenHelp,
}: Options) {
  const keyboardFocusIntentRef = useRef(false);

  useEffect(() => {
    const handlePointerDown = () => {
      keyboardFocusIntentRef.current = false;
    };
    const handleFocusIntentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') keyboardFocusIntentRef.current = true;
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleFocusIntentKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleFocusIntentKeyDown, true);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        isDialogBlockingShortcuts(event.target) ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        onOpenHelp();
        return;
      }

      const canUsePrimaryShortcut = event.metaKey || event.ctrlKey;
      if (canUsePrimaryShortcut) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) onRedo();
          else onUndo();
          return;
        }
        if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault();
          onRedo();
        }
        return;
      }

      if (
        !transportEnabled ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (event.code === 'Space') {
        if (keyboardFocusIntentRef.current && isSpaceActivatableControl(event.target)) {
          return;
        }
        event.preventDefault();
        onTogglePlayback();
        return;
      }

      if (event.code === 'KeyS' && canStamp) {
        event.preventDefault();
        onStamp();
        return;
      }

      if (event.code === 'KeyF' && canFinish) {
        event.preventDefault();
        onFinish();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    canFinish,
    canStamp,
    onFinish,
    onOpenHelp,
    onRedo,
    onStamp,
    onTogglePlayback,
    onUndo,
    transportEnabled,
  ]);
}
