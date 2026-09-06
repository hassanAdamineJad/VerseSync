import { test, expect } from '@playwright/test';

function createSilentWavBuffer(durationSeconds: number): Buffer {
  const sampleRate = 8000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const blockAlign = channelCount * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const frameCount = sampleRate * durationSeconds;
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

test('segment inspector accepts formatted timecodes and preserves invalid drafts', async ({
  page,
}) => {
  await page.goto('/');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'timecode-local.wav',
    mimeType: 'audio/wav',
    buffer: createSilentWavBuffer(20),
  });
  await page.getByRole('textbox', { name: 'Lyric lines' }).fill('Alpha\nBeta');
  await page.getByRole('button', { name: 'Open timing workspace' }).click();

  await expect(page.getByText('timecode-local.wav', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Stamp/ }).click();

  const seekInput = page.locator('.toolbar-seek input');
  await expect(seekInput).toBeEnabled();
  await seekInput.evaluate((node, value) => {
    const input = node as HTMLInputElement;
    const prototype = Object.getPrototypeOf(input) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, 15000);
  await expect(page.locator('.toolbar-time strong')).toContainText('00:15.000');
  await page.getByRole('button', { name: /Finish Line/ }).click();

  const startInput = page.locator('label:has-text("Start") input');
  const endInput = page.locator('label:has-text("End") input');
  const applyButton = page.getByRole('button', { name: 'Apply exact timing' });
  const segment = page.locator('.timeline-segment').first();
  const summary = page.locator('.timing-summary');

  await expect(startInput).toHaveValue('00:00.000');
  await expect(endInput).toHaveValue('00:15.000');

  await startInput.fill('13252');
  await endInput.fill('17000');
  await applyButton.click();

  await expect(startInput).toHaveValue('00:13.252');
  await expect(endInput).toHaveValue('00:17.000');
  await expect(summary).toContainText('00:13.252');
  await expect(segment).toHaveAttribute(
    'aria-label',
    /Alpha from 00:13\.252 to 00:17\.000/,
  );

  await endInput.fill('00:17.500');
  await applyButton.click();
  await expect(endInput).toHaveValue('00:17.500');
  await expect(segment).toHaveAttribute(
    'aria-label',
    /Alpha from 00:13\.252 to 00:17\.500/,
  );

  await startInput.fill('abc');
  await applyButton.click();
  await expect(
    page.getByText('Start: Use mm:ss.SSS or paste a whole millisecond value.'),
  ).toBeVisible();
  await expect(startInput).toHaveValue('abc');
  await expect(summary).toContainText('00:13.252');

  await startInput.fill('00:13.252');
  await expect(
    page.getByText('Start: Use mm:ss.SSS or paste a whole millisecond value.'),
  ).toHaveCount(0);

  await startInput.fill('00:61.000');
  await applyButton.click();
  await expect(page.getByText('Start: Seconds must stay between 00 and 59.')).toBeVisible();
  await expect(startInput).toHaveValue('00:61.000');

  await startInput.fill('00:13.252');
  await endInput.fill('00:13.252');
  await applyButton.click();
  await expect(page.getByText('End must be later than start.')).toBeVisible();
  await expect(endInput).toHaveValue('00:13.252');

  await endInput.fill('00:25.000');
  await applyButton.click();
  await expect(page.getByText('End must be no later than 00:20.000.')).toBeVisible();
  await expect(endInput).toHaveValue('00:25.000');
  await expect(segment).toHaveAttribute(
    'aria-label',
    /Alpha from 00:13\.252 to 00:17\.500/,
  );

  await endInput.fill('00:18.000');
  await applyButton.click();
  await expect(endInput).toHaveValue('00:18.000');
  await expect(segment).toHaveAttribute(
    'aria-label',
    /Alpha from 00:13\.252 to 00:18\.000/,
  );
});
