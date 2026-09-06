import type { EditorState } from './editor';
import { formatTimecode } from './timecode';

export function generateLrc(state: EditorState): string {
  const linesById = new Map(state.document.lines.map((line) => [line.id, line]));

  return Object.values(state.segments)
    .map((segment) => {
      const line = linesById.get(segment.lineId);
      if (!line) return null;

      return {
        startMs: segment.startMs,
        lineIndex: line.index,
        text: line.text,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => a.startMs - b.startMs || a.lineIndex - b.lineIndex)
    .map((entry) => `[${formatTimecode(entry.startMs)}]${entry.text}`)
    .join('\n');
}
