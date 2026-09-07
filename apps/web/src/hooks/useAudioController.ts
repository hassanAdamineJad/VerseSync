import { useCallback, useEffect, useRef, useState } from 'react';
import { secondsToMilliseconds } from '../editor';

type SourceInput =
  | { kind: 'seeded'; url: string }
  | { kind: 'local'; file: File };

export type PreparedAudioSource = {
  generation: number;
  url: string;
  durationMs: number;
  isObjectUrl: boolean;
};

type PlaybackState = {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  isReady: boolean;
  error: string | null;
  playbackRate: number;
};

type PitchPreservingAudio = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

const initialPlaybackState: PlaybackState = {
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  isReady: false,
  error: null,
  playbackRate: 1,
};

function applyPlaybackRate(audio: HTMLAudioElement, playbackRate: number) {
  audio.playbackRate = playbackRate;

  const pitchPreservingAudio = audio as PitchPreservingAudio;
  if ('preservesPitch' in pitchPreservingAudio) {
    pitchPreservingAudio.preservesPitch = true;
  }
  if ('mozPreservesPitch' in pitchPreservingAudio) {
    pitchPreservingAudio.mozPreservesPitch = true;
  }
  if ('webkitPreservesPitch' in pitchPreservingAudio) {
    pitchPreservingAudio.webkitPreservesPitch = true;
  }
}

export function useAudioController(onEnded: (durationMs: number) => void) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const onEndedRef = useRef(onEnded);
  const generationRef = useRef(0);
  const pendingObjectUrlRef = useRef<string | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const activeResolvedUrlRef = useRef<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>(initialPlaybackState);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    applyPlaybackRate(audio, playback.playbackRate);
  }, [playback.playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const belongsToActiveSource = () =>
      activeResolvedUrlRef.current != null &&
      audio.currentSrc === activeResolvedUrlRef.current;
    const updateTime = () => {
      if (!belongsToActiveSource()) return;
      setPlayback((current) => ({
        ...current,
        currentTimeMs: secondsToMilliseconds(audio.currentTime),
      }));
    };
    const handlePlay = () => {
      if (!belongsToActiveSource()) return;
      setPlayback((current) => ({ ...current, isPlaying: true, error: null }));
    };
    const handlePause = () => {
      if (!belongsToActiveSource()) return;
      setPlayback((current) => ({ ...current, isPlaying: false }));
    };
    const handleError = () => {
      if (!belongsToActiveSource() || audio.error == null) return;
      setPlayback((current) => ({
        ...current,
        isPlaying: false,
        isReady: false,
        error: 'Audio playback failed. Try loading the source again.',
      }));
    };
    const handleEnded = () => {
      if (!belongsToActiveSource() || !audio.ended) return;
      const durationMs = secondsToMilliseconds(audio.duration);
      setPlayback((current) => ({
        ...current,
        currentTimeMs: durationMs,
        durationMs,
        isPlaying: false,
      }));
      onEndedRef.current(durationMs);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('seeking', updateTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('seeking', updateTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(
    () => () => {
      generationRef.current += 1;
      if (pendingObjectUrlRef.current) URL.revokeObjectURL(pendingObjectUrlRef.current);
      if (activeObjectUrlRef.current) URL.revokeObjectURL(activeObjectUrlRef.current);
    },
    [],
  );

  const prepareSource = useCallback((input: SourceInput): Promise<PreparedAudioSource> => {
    generationRef.current += 1;
    const generation = generationRef.current;

    if (pendingObjectUrlRef.current) {
      URL.revokeObjectURL(pendingObjectUrlRef.current);
      pendingObjectUrlRef.current = null;
    }

    const isObjectUrl = input.kind === 'local';
    const url = isObjectUrl ? URL.createObjectURL(input.file) : input.url;
    if (isObjectUrl) pendingObjectUrlRef.current = url;

    return new Promise((resolve, reject) => {
      const probe = new Audio();
      probe.preload = 'metadata';

      const cleanup = () => {
        probe.removeEventListener('loadedmetadata', handleMetadata);
        probe.removeEventListener('error', handleError);
        probe.removeAttribute('src');
        probe.load();
      };
      const rejectStale = () => {
        cleanup();
        if (isObjectUrl && pendingObjectUrlRef.current === url) {
          URL.revokeObjectURL(url);
          pendingObjectUrlRef.current = null;
        }
        reject(new DOMException('A newer source replaced this request.', 'AbortError'));
      };
      const handleMetadata = () => {
        if (generation !== generationRef.current) {
          rejectStale();
          return;
        }
        const durationMs = secondsToMilliseconds(probe.duration);
        if (!Number.isFinite(probe.duration) || durationMs <= 0) {
          cleanup();
          if (isObjectUrl && pendingObjectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            pendingObjectUrlRef.current = null;
          }
          reject(new Error('The audio has no usable duration.'));
          return;
        }
        cleanup();
        resolve({ generation, url, durationMs, isObjectUrl });
      };
      const handleError = () => {
        if (generation !== generationRef.current) {
          rejectStale();
          return;
        }
        cleanup();
        if (isObjectUrl && pendingObjectUrlRef.current === url) {
          URL.revokeObjectURL(url);
          pendingObjectUrlRef.current = null;
        }
        reject(new Error('The browser could not read this audio source.'));
      };

      probe.addEventListener('loadedmetadata', handleMetadata);
      probe.addEventListener('error', handleError);
      probe.src = url;
    });
  }, []);

  const commitSource = useCallback((prepared: PreparedAudioSource): boolean => {
    if (prepared.generation !== generationRef.current) return false;
    const audio = audioRef.current;
    if (!audio) return false;

    audio.pause();
    if (activeObjectUrlRef.current && activeObjectUrlRef.current !== prepared.url) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
    }
    activeObjectUrlRef.current = prepared.isObjectUrl ? prepared.url : null;
    if (pendingObjectUrlRef.current === prepared.url) pendingObjectUrlRef.current = null;

    activeResolvedUrlRef.current = new URL(prepared.url, window.location.href).href;
    audio.src = prepared.url;
    audio.load();
    applyPlaybackRate(audio, 1);
    setPlayback({
      currentTimeMs: 0,
      durationMs: prepared.durationMs,
      isPlaying: false,
      isReady: true,
      error: null,
      playbackRate: 1,
    });
    return true;
  }, []);

  const cancelPreparedSource = useCallback(() => {
    generationRef.current += 1;
    if (pendingObjectUrlRef.current) {
      URL.revokeObjectURL(pendingObjectUrlRef.current);
      pendingObjectUrlRef.current = null;
    }
  }, []);

  const readCurrentTimeMs = useCallback(() => {
    const audio = audioRef.current;
    return audio ? secondsToMilliseconds(audio.currentTime) : 0;
  }, []);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !activeResolvedUrlRef.current) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlayback((current) => ({
          ...current,
          error: 'Playback could not start. Use the play control and try again.',
        }));
      }
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback((milliseconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(milliseconds)) return;
    const durationMs = secondsToMilliseconds(audio.duration);
    const boundedMs = Math.min(Math.max(0, Math.round(milliseconds)), durationMs);
    audio.currentTime = boundedMs / 1000;
    setPlayback((current) => ({ ...current, currentTimeMs: boundedMs }));
  }, []);

  const setPlaybackRate = useCallback((playbackRate: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(playbackRate) || playbackRate <= 0) return;

    applyPlaybackRate(audio, playbackRate);
    setPlayback((current) =>
      current.playbackRate === playbackRate
        ? current
        : { ...current, playbackRate },
    );
  }, []);

  return {
    audioRef,
    playback,
    prepareSource,
    commitSource,
    cancelPreparedSource,
    readCurrentTimeMs,
    setPlaybackRate,
    togglePlayback,
    seek,
  };
}
