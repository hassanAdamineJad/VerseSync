import type { SeededTrackResponse } from './api';

export type LyricLine = {
  id: string;
  index: number;
  text: string;
};

export type CompletedSegment = {
  lineId: string;
  startMs: number;
  endMs: number;
};

export type OpenSegment = {
  lineId: string;
  startMs: number;
};

export type TrackSource =
  | {
      kind: 'seeded';
      id: string;
      version: number;
      audioUrl: string;
    }
  | {
      kind: 'local';
      fileName: string;
      audioUrl: string;
    };

export type EditorDocument = {
  title: string;
  artist?: string;
  durationMs: number;
  lines: LyricLine[];
  source: TrackSource;
  initialSegments: CompletedSegment[];
};

export type EditorState = {
  document: EditorDocument;
  segments: Record<string, CompletedSegment>;
  openSegment: OpenSegment | null;
  selectedLineId: string | null;
  captureCursorLineId: string | null;
  message: string | null;
  dirty: boolean;
};

export type EditorAction =
  | { type: 'select'; lineId: string }
  | { type: 'inspect'; lineId: string }
  | { type: 'stamp'; atMs: number }
  | { type: 'finish'; atMs: number }
  | { type: 'mediaEnded'; durationMs: number }
  | { type: 'editSegment'; lineId: string; startMs: number; endMs: number }
  | { type: 'editSegments'; segments: CompletedSegment[] }
  | { type: 'clearMessage' };

export type LyricParseResult =
  | { ok: true; lines: LyricLine[] }
  | { ok: false; error: string };

const toIntegerMs = (seconds: number) => Math.round(seconds * 1000);

export function parsePastedLyrics(value: string): LyricParseResult {
  const textLines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (textLines.length === 0) {
    return { ok: false, error: 'Paste at least one non-empty lyric line.' };
  }

  return {
    ok: true,
    lines: textLines.map((text, index) => ({
      id: crypto.randomUUID(),
      index,
      text,
    })),
  };
}

export function normalizeSeededTrack(
  track: SeededTrackResponse,
  mediaDurationMs: number,
): EditorDocument {
  return {
    title: track.title,
    artist: track.artist,
    durationMs: mediaDurationMs,
    lines: track.lines.map((line) => ({ ...line })),
    source: {
      kind: 'seeded',
      id: track.id,
      version: track.version,
      audioUrl: track.audio_url,
    },
    initialSegments:
      track.alignment?.segments.map((segment) => ({
        lineId: segment.line_id,
        startMs: segment.start_ms,
        endMs: segment.end_ms,
      })) ?? [],
  };
}

export function normalizeLocalTrack(
  fileName: string,
  audioUrl: string,
  mediaDurationMs: number,
  lines: LyricLine[],
): EditorDocument {
  return {
    title: fileName,
    durationMs: mediaDurationMs,
    lines,
    source: { kind: 'local', fileName, audioUrl },
    initialSegments: [],
  };
}

export function createEditorState(document: EditorDocument): EditorState {
  const segments = Object.fromEntries(
    document.initialSegments.map((segment) => [segment.lineId, { ...segment }]),
  );
  const firstUntimed = document.lines.find((line) => segments[line.id] == null)?.id ?? null;

  return {
    document,
    segments,
    openSegment: null,
    selectedLineId: firstUntimed ?? document.lines[0]?.id ?? null,
    captureCursorLineId: firstUntimed,
    message: null,
    dirty: false,
  };
}

function nextUntimedLineId(
  state: EditorState,
  afterLineId: string,
  segments: Record<string, CompletedSegment>,
): string | null {
  const lineIndex = state.document.lines.findIndex((line) => line.id === afterLineId);
  return (
    state.document.lines
      .slice(lineIndex + 1)
      .find((line) => segments[line.id] == null)?.id ?? null
  );
}

function invalidCloseMessage(startMs: number): string {
  return `The end must be later than ${formatTime(startMs)}. Seek or play forward, then try again.`;
}

function closeOpenSegment(
  state: EditorState,
  endMs: number,
): { state: EditorState; nextLineId: string | null } | { error: string } {
  const open = state.openSegment;
  if (!open) return { error: 'There is no open line to finish.' };
  if (!Number.isInteger(endMs) || endMs <= open.startMs) {
    return { error: invalidCloseMessage(open.startMs) };
  }
  if (endMs > state.document.durationMs) {
    return { error: 'The end time cannot be later than the audio duration.' };
  }

  const segments = {
    ...state.segments,
    [open.lineId]: { lineId: open.lineId, startMs: open.startMs, endMs },
  };
  const nextLineId = nextUntimedLineId(state, open.lineId, segments);

  return {
    state: {
      ...state,
      segments,
      openSegment: null,
      selectedLineId: open.lineId,
      captureCursorLineId: nextLineId,
      message: null,
      dirty: true,
    },
    nextLineId,
  };
}

function stamp(state: EditorState, atMs: number): EditorState {
  if (!Number.isInteger(atMs) || atMs < 0 || atMs > state.document.durationMs) {
    return { ...state, message: 'The playhead is outside the usable audio range.' };
  }

  if (!state.openSegment) {
    const lineId = state.captureCursorLineId ?? state.selectedLineId;
    if (!lineId) return { ...state, message: 'Every lyric line is already timed.' };
    if (state.segments[lineId]) {
      return {
        ...state,
        message: 'That line is already timed. Select an untimed line to continue.',
      };
    }
    if (atMs >= state.document.durationMs) {
      return {
        ...state,
        message: 'Seek before the end of the audio to start a lyric line.',
      };
    }
    return {
      ...state,
      openSegment: { lineId, startMs: atMs },
      selectedLineId: lineId,
      message: null,
      dirty: true,
    };
  }

  if (atMs >= state.document.durationMs) {
    return {
      ...state,
      message:
        'Stamp & Next cannot open a line at the end of the audio. Use Finish Line to close the current line.',
    };
  }

  const closed = closeOpenSegment(state, atMs);
  if ('error' in closed) return { ...state, message: closed.error };
  if (!closed.nextLineId) {
    return { ...closed.state, message: 'All lyric lines are timed.' };
  }

  return {
    ...closed.state,
    openSegment: { lineId: closed.nextLineId, startMs: atMs },
    selectedLineId: closed.nextLineId,
  };
}

function finish(state: EditorState, atMs: number): EditorState {
  const closed = closeOpenSegment(state, atMs);
  if ('error' in closed) return { ...state, message: closed.error };
  return {
    ...closed.state,
    message: closed.nextLineId
      ? 'Line finished. The next stamp will start the next untimed line.'
      : 'All lyric lines are timed.',
  };
}

function mediaEnded(state: EditorState, durationMs: number): EditorState {
  if (!state.openSegment) return state;
  const endMs = Math.min(durationMs, state.document.durationMs);
  const closed = closeOpenSegment(state, endMs);
  if ('error' in closed) return { ...state, message: closed.error };

  const remaining = state.document.lines.filter(
    (line) => closed.state.segments[line.id] == null,
  ).length;
  return {
    ...closed.state,
    message:
      remaining > 0
        ? `Playback ended. ${remaining} lyric ${remaining === 1 ? 'line remains' : 'lines remain'} untimed.`
        : 'Playback ended and the final line was finished.',
  };
}

function applySegmentUpdates(
  state: EditorState,
  updates: CompletedSegment[],
): EditorState {
  const nextSegments = { ...state.segments };

  for (const update of updates) {
    if (!nextSegments[update.lineId]) {
      return { ...state, message: 'Only completed lines have editable start and end times.' };
    }
    if (
      !Number.isInteger(update.startMs) ||
      !Number.isInteger(update.endMs) ||
      update.startMs < 0 ||
      update.endMs > state.document.durationMs ||
      update.endMs <= update.startMs
    ) {
      return {
        ...state,
        message: `Use whole milliseconds between 0 and ${state.document.durationMs}, with end later than start.`,
      };
    }

    nextSegments[update.lineId] = update;
  }

  const overlaps = Object.values(nextSegments).some((segment, index, allSegments) =>
    allSegments.some(
      (otherSegment, otherIndex) =>
        otherIndex > index &&
        segment.startMs < otherSegment.endMs &&
        segment.endMs > otherSegment.startMs,
    ),
  );

  return {
    ...state,
    segments: nextSegments,
    message: overlaps ? 'Timing saved. This line overlaps another completed line.' : 'Timing saved.',
    dirty: true,
  };
}

function editSegment(
  state: EditorState,
  lineId: string,
  startMs: number,
  endMs: number,
): EditorState {
  return applySegmentUpdates(state, [{ lineId, startMs, endMs }]);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select': {
      if (!state.document.lines.some((line) => line.id === action.lineId)) return state;
      return {
        ...state,
        selectedLineId: action.lineId,
        captureCursorLineId: state.openSegment ? state.captureCursorLineId : action.lineId,
        message: null,
      };
    }
    case 'inspect': {
      if (!state.document.lines.some((line) => line.id === action.lineId)) return state;
      return {
        ...state,
        selectedLineId: action.lineId,
        message: null,
      };
    }
    case 'stamp':
      return stamp(state, action.atMs);
    case 'finish':
      return finish(state, action.atMs);
    case 'mediaEnded':
      return mediaEnded(state, action.durationMs);
    case 'editSegment':
      return editSegment(state, action.lineId, action.startMs, action.endMs);
    case 'editSegments':
      return applySegmentUpdates(state, action.segments);
    case 'clearMessage':
      return { ...state, message: null };
  }
}

export function getPlayingLineId(state: EditorState, currentTimeMs: number): string | null {
  const active = Object.values(state.segments)
    .filter(
      (segment) => segment.startMs <= currentTimeMs && currentTimeMs < segment.endMs,
    )
    .sort((a, b) => b.startMs - a.startMs || lineOrder(state, a.lineId) - lineOrder(state, b.lineId));

  if (
    state.openSegment &&
    state.openSegment.startMs <= currentTimeMs &&
    currentTimeMs <= state.document.durationMs
  ) {
    active.push({
      lineId: state.openSegment.lineId,
      startMs: state.openSegment.startMs,
      endMs: state.document.durationMs,
    });
    active.sort(
      (a, b) => b.startMs - a.startMs || lineOrder(state, a.lineId) - lineOrder(state, b.lineId),
    );
  }

  return active[0]?.lineId ?? null;
}

function lineOrder(state: EditorState, lineId: string): number {
  return state.document.lines.findIndex((line) => line.id === lineId);
}

export function formatTime(milliseconds: number): string {
  const safeMs = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function secondsToMilliseconds(seconds: number): number {
  return toIntegerMs(seconds);
}
