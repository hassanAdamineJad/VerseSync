import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getSeededTrack } from '../api';
import {
  getLocalAudioFileError,
  normalizeLocalTrack,
  normalizeSeededTrack,
  parsePastedLyrics,
  type EditorDocument,
  type EditorState,
} from '../editor';
import type { PreparedAudioSource } from './useAudioController';

type PendingCandidate = {
  document: EditorDocument;
  audio: PreparedAudioSource;
};

type SourceLoadingState = 'seeded' | 'local' | null;

type Options = {
  editor: EditorState | null;
  prepareSource: (
    input: { kind: 'seeded'; url: string } | { kind: 'local'; file: File },
  ) => Promise<PreparedAudioSource>;
  commitSource: (prepared: PreparedAudioSource) => boolean;
  cancelPreparedSource: () => void;
  onReplaceDocument: (document: EditorDocument) => void;
  onBeforeSourceSwap: () => void;
};

function sourceError(error: unknown): string {
  if (error instanceof ApiError) {
    return `The seeded track could not be loaded (${error.status}). You can retry or load a local file.`;
  }
  if (error instanceof Error) return error.message;
  return 'The source could not be loaded.';
}

export function useTrackSourceFlow({
  editor,
  prepareSource,
  commitSource,
  cancelPreparedSource,
  onReplaceDocument,
  onBeforeSourceSwap,
}: Options) {
  const editorRef = useRef(editor);
  const attemptRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const [seededError, setSeededError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState<SourceLoadingState>(null);
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const beginAttempt = useCallback(() => {
    attemptRef.current += 1;
    fetchAbortRef.current?.abort();
    cancelPreparedSource();
    setPendingCandidate(null);
    onBeforeSourceSwap();
    return attemptRef.current;
  }, [cancelPreparedSource, onBeforeSourceSwap]);

  const offerCandidate = useCallback(
    (document: EditorDocument, audio: PreparedAudioSource) => {
      const current = editorRef.current;
      const needsConfirmation =
        current != null && (current.dirty || current.document.source.kind === 'local');

      if (needsConfirmation) {
        setPendingCandidate({ document, audio });
        return;
      }

      if (commitSource(audio)) onReplaceDocument(document);
    },
    [commitSource, onReplaceDocument],
  );

  const loadSeeded = useCallback(async () => {
    const attempt = beginAttempt();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setSeededError(null);
    setSourceLoading('seeded');

    try {
      const track = await getSeededTrack(controller.signal);
      if (attempt !== attemptRef.current) return;
      const prepared = await prepareSource({ kind: 'seeded', url: track.audio_url });
      if (attempt !== attemptRef.current) return;
      offerCandidate(normalizeSeededTrack(track, prepared.durationMs), prepared);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        attempt !== attemptRef.current
      ) {
        return;
      }
      setSeededError(sourceError(error));
    } finally {
      if (attempt === attemptRef.current) setSourceLoading(null);
    }
  }, [beginAttempt, offerCandidate, prepareSource]);

  const importTrack = useCallback(
    async (file: File, lyrics: string) => {
      setSeededError(null);
      setImportError(null);
      const audioError = getLocalAudioFileError(file);
      if (audioError) {
        setImportError(audioError);
        return;
      }
      const parsed = parsePastedLyrics(lyrics);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }

      const attempt = beginAttempt();
      setSourceLoading('local');
      try {
        const prepared = await prepareSource({ kind: 'local', file });
        if (attempt !== attemptRef.current) return;
        offerCandidate(
          normalizeLocalTrack(file.name, prepared.url, prepared.durationMs, parsed.lines),
          prepared,
        );
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === 'AbortError') ||
          attempt !== attemptRef.current
        ) {
          return;
        }
        setImportError(
          `${sourceError(error)} Choose a browser-supported audio file and try again.`,
        );
      } finally {
        if (attempt === attemptRef.current) setSourceLoading(null);
      }
    },
    [beginAttempt, offerCandidate, prepareSource],
  );

  const confirmReplacement = useCallback(() => {
    if (!pendingCandidate) return;
    onBeforeSourceSwap();
    if (commitSource(pendingCandidate.audio)) {
      onReplaceDocument(pendingCandidate.document);
    }
    setPendingCandidate(null);
  }, [commitSource, onBeforeSourceSwap, onReplaceDocument, pendingCandidate]);

  const cancelReplacement = useCallback(() => {
    cancelPreparedSource();
    setPendingCandidate(null);
    onBeforeSourceSwap();
  }, [cancelPreparedSource, onBeforeSourceSwap]);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      fetchAbortRef.current?.abort();
      cancelPreparedSource();
    },
    [cancelPreparedSource],
  );

  return {
    seededError,
    importError,
    sourceLoading,
    pendingCandidateTitle: pendingCandidate?.document.title ?? null,
    loadSeeded,
    importTrack,
    confirmReplacement,
    cancelReplacement,
  };
}
