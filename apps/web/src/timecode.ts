export type TimecodeParseResult =
  | { ok: true; milliseconds: number }
  | { ok: false; error: string };

export function formatTimecode(milliseconds: number): string {
  const safeMs = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function parseTimecode(input: string): TimecodeParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: false, error: 'Enter a timecode like 00:13.252 or a millisecond value.' };
  }

  if (trimmed.startsWith('-')) {
    return { ok: false, error: 'Time values cannot be negative.' };
  }

  if (/^\d+$/.test(trimmed)) {
    return { ok: true, milliseconds: Number(trimmed) };
  }

  const match = trimmed.match(/^(\d{2,}):(\d{2})\.(\d{1,3})$/);
  if (!match) {
    return { ok: false, error: 'Use mm:ss.SSS or paste a whole millisecond value.' };
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number(match[3].padEnd(3, '0'));

  if (seconds > 59) {
    return { ok: false, error: 'Seconds must stay between 00 and 59.' };
  }

  return {
    ok: true,
    milliseconds: minutes * 60_000 + seconds * 1000 + milliseconds,
  };
}
