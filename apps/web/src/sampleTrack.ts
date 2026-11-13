export type ApiLyricLine = {
  id: string;
  index: number;
  text: string;
};

export type ApiSegment = {
  line_id: string;
  start_ms: number;
  end_ms: number;
};

export type SeededTrackResponse = {
  id: string;
  title: string;
  artist: string;
  duration_seconds: number;
  audio_url: string;
  lines: ApiLyricLine[];
  version: number;
  alignment: { segments: ApiSegment[] } | null;
};

/** Load the bundled sample; edits stay in the browser session. */
export async function getSeededTrack(signal?: AbortSignal): Promise<SeededTrackResponse> {
  const response = await fetch('/demo/track.json', { signal });
  if (!response.ok) {
    throw new Error(`The sample track could not be loaded (${response.status}). Retry or load a local file.`);
  }
  return response.json();
}
