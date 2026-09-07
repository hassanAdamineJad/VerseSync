import { Buffer } from 'node:buffer';
import { expect, type Page } from '@playwright/test';

function createSilentWavBuffer(durationSeconds = 20): Buffer {
  const sampleRate = 8_000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const frameCount = Math.round(sampleRate * durationSeconds);
  const dataSize = frameCount * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

export async function openLocalTrack(
  page: Page,
  lyrics: string,
  options?: {
    filename?: string;
    durationSeconds?: number;
  },
): Promise<void> {
  const filename = options?.filename ?? 'test-track.wav';
  const durationSeconds = options?.durationSeconds ?? 20;

  await page.goto('/');

  await page.getByLabel('Select an audio file').setInputFiles({
    name: filename,
    mimeType: 'audio/wav',
    buffer: createSilentWavBuffer(durationSeconds),
  });

  await page.getByRole('textbox', { name: 'Lyric lines' }).fill(lyrics);
  await page.getByRole('button', { name: 'Open timing workspace' }).click();

  await expect(page.getByText(filename, { exact: true })).toBeVisible();
}

export async function setPlaybackPosition(
  page: Page,
  milliseconds: number,
): Promise<void> {
  const seekInput = page.getByRole('slider', { name: 'Seek through audio' });

  await expect(seekInput).toBeEnabled();

  await seekInput.evaluate((node, nextValue) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;

    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, milliseconds);
}
