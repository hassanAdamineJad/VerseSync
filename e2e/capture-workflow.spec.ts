import { expect, test } from '@playwright/test';

import { openLocalTrack, setPlaybackPosition } from './helpers/track';

test('one-pass capture times the first three lines and leaves the fourth untimed', async ({
  page,
}) => {
  await openLocalTrack(page, 'One\nTwo\nThree\nFour');

  const firstRow = page.getByRole('listitem').nth(0);
  const secondRow = page.getByRole('listitem').nth(1);
  const thirdRow = page.getByRole('listitem').nth(2);
  const fourthRow = page.getByRole('listitem').nth(3);

  await page.getByRole('button', { name: /^Stamp/ }).click();
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(page.getByText('Opened at 00:00.000')).toBeVisible();

  await setPlaybackPosition(page, 3_000);
  await page.getByRole('button', { name: /Stamp & Next/ }).click();

  const firstSegment = page.getByRole('button', {
    name: 'One from 00:00.000 to 00:03.000',
  });
  await expect(firstSegment).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
  await expect(page.getByText('Opened at 00:03.000')).toBeVisible();
  await expect(fourthRow.getByRole('button', { name: 'Untimed line' })).toBeVisible();

  await setPlaybackPosition(page, 6_000);
  await page.getByRole('button', { name: /Stamp & Next/ }).click();

  const secondSegment = page.getByRole('button', {
    name: 'Two from 00:03.000 to 00:06.000',
  });
  await expect(firstSegment).toBeVisible();
  await expect(secondSegment).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Three' })).toBeVisible();
  await expect(page.getByText('Opened at 00:06.000')).toBeVisible();

  await setPlaybackPosition(page, 9_000);
  await page.getByRole('button', { name: /Finish Line/ }).click();

  await expect(firstSegment).toBeVisible();
  await expect(secondSegment).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Three from 00:06.000 to 00:09.000' }),
  ).toBeVisible();

  await expect(firstRow.getByRole('button', { name: 'Start time 00:00.000' })).toBeVisible();
  await expect(secondRow.getByRole('button', { name: 'Start time 00:03.000' })).toBeVisible();
  await expect(thirdRow.getByRole('button', { name: 'Start time 00:06.000' })).toBeVisible();
  await expect(fourthRow.getByRole('button', { name: 'Untimed line' })).toBeVisible();

  await expect(page.getByText('3 / 4 timed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Four' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Line finished. The next stamp will start the next untimed line.',
    }),
  ).toBeVisible();
});
