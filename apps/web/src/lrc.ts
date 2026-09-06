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

function buildLrcFilename(title: string) {
  const base = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ');
  return `${base || 'lyric-alignment'}.lrc`;
}

export function downloadLrc(state: EditorState): boolean {
  const content = generateLrc(state);
  if (!content) return false;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildLrcFilename(state.document.title);
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);

  return true;
}
