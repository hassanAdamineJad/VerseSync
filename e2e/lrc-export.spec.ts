import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { openLocalTrack, setPlaybackPosition } from './helpers/track';

test('exports current alignment as LRC from in-memory state', async ({
  page,
}, testInfo) => {
  await openLocalTrack(page, 'Echo\nEcho\nSolo', {
    filename: 'export-check.wav',
  });

  const exportButton = page.getByRole('button', { name: 'Export LRC' });

  await expect(exportButton).toBeDisabled();

  await page.getByRole('button', { name: /^Stamp/ }).click();
  await setPlaybackPosition(page, 3_000);
  await page.getByRole('button', { name: /Finish Line/ }).click();

  await page.getByRole('button', { name: /^Stamp/ }).click();
  await setPlaybackPosition(page, 6_000);
  await page.getByRole('button', { name: /Finish Line/ }).click();

  await expect(exportButton).toBeEnabled();

  await page.getByRole('textbox', { name: 'Start' }).fill('00:00.000');
  await page.getByRole('textbox', { name: 'End' }).fill('00:06.000');
  await page.getByRole('button', { name: 'Apply exact timing' }).click();

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();

  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('export-check.wav.lrc');

  const savedPath = testInfo.outputPath('alignment.lrc');
  await download.saveAs(savedPath);

  const content = await readFile(savedPath, 'utf8');

  expect(content).toBe(
    ['[00:00.000]Echo', '[00:00.000]Echo'].join('\n'),
  );
});
