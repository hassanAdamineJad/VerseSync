import { expect, test, type Locator, type Page } from '@playwright/test';

import { openLocalTrack, setPlaybackPosition } from './helpers/track';

test('one-pass capture times the first three lines and leaves the fourth untimed', async ({
  page,
}) => {
  await openLocalTrack(page, 'One\nTwo\nThree\nFour');

  const firstRow = page.getByRole('listitem').nth(0);
  const secondRow = page.getByRole('listitem').nth(1);
  const thirdRow = page.getByRole('listitem').nth(2);
  const fourthRow = page.getByRole('listitem').nth(3);

  await page.getByRole('button', { name: 'Stamp line start' }).click();
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stamp and advance to next line' })).toBeEnabled();
  await expect(page.getByRole('img', { name: /One capturing from 00:00.000/ })).toBeVisible();

  await setPlaybackPosition(page, 3_000);
  await page.getByRole('button', { name: 'Stamp and advance to next line' }).click();

  const firstSegment = page.getByRole('button', {
    name: 'One from 00:00.000 to 00:03.000',
  });
  await expect(firstSegment).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stamp and advance to next line' })).toBeEnabled();
  await expect(page.getByRole('img', { name: /Two capturing from 00:03.000/ })).toBeVisible();
  await expect(fourthRow.getByRole('button', { name: 'Untimed line' })).toBeVisible();

  await setPlaybackPosition(page, 6_000);
  await page.getByRole('button', { name: 'Stamp and advance to next line' }).click();

  const secondSegment = page.getByRole('button', {
    name: 'Two from 00:03.000 to 00:06.000',
  });
  await expect(firstSegment).toBeVisible();
  await expect(secondSegment).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Three' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stamp and advance to next line' })).toBeEnabled();
  await expect(page.getByRole('img', { name: /Three capturing from 00:06.000/ })).toBeVisible();

  await setPlaybackPosition(page, 9_000);
  await page.getByRole('button', { name: 'Finish line' }).click();

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

test('capture shortcuts work globally without depending on panel focus', async ({ page }) => {
  await openLocalTrack(page, 'One\nTwo\nThree\nFour');

  const playButton = page.getByRole('button', { name: 'Play' });
  await expect(playButton).toBeEnabled();
  await playButton.click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await setPlaybackPosition(page, 0);

  await page.keyboard.press('s');
  await expect(captureState(page)).toHaveText('Capturing');
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stamp and advance to next line' })).toBeVisible();
  await expect(page.getByRole('img', { name: /One capturing from 00:00.000/ })).toBeVisible();

  await dispatchRepeatedKey(page, 'KeyS');
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(page.getByRole('img', { name: /One capturing from 00:00.000/ })).toBeVisible();

  await page.keyboard.press('Space');
  await expect(playButton).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(captureState(page)).toHaveText('Capturing');

  await setPlaybackPosition(page, 3_000);
  await page.keyboard.press('s');
  await expect(
    page.getByRole('button', { name: 'One from 00:00.000 to 00:03.000' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Two capturing from 00:03.000/ })).toBeVisible();

  await setPlaybackPosition(page, 6_000);
  await page.keyboard.press('f');
  await expect(
    page.getByRole('button', { name: 'Two from 00:03.000 to 00:06.000' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Three' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Line finished. The next stamp will start the next untimed line.',
    }),
  ).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(page.getByRole('img', { name: /Two capturing from 00:03.000/ })).toBeVisible();
});

test('pointer-focused Stamp and Finish do not steal Space or later shortcuts', async ({
  page,
}) => {
  await openLocalTrack(page, 'One\nTwo\nThree');

  const stampButton = page.getByRole('button', { name: 'Stamp line start' });
  await stampButton.click();
  await expect(captureState(page)).toHaveText('Capturing');

  const stampNextButton = page.getByRole('button', { name: 'Stamp and advance to next line' });
  await attachClickCounter(stampNextButton);

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(captureState(page)).toHaveText('Capturing');
  await expect(page.getByText('The end must be later than')).toHaveCount(0);
  expect(await readClickCount(stampNextButton)).toBe(0);

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(await readClickCount(stampNextButton)).toBe(0);

  await setPlaybackPosition(page, 3_000);
  await page.getByRole('button', { name: 'Finish line' }).click();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Line finished. The next stamp will start the next untimed line.',
    }),
  ).toBeVisible();

  await page.keyboard.press('s');
  await expect(captureState(page)).toHaveText('Capturing');
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Two capturing from 00:03.000/ })).toBeVisible();
});

test('editor shortcuts ignore fields and dialogs but keep keyboard button activation', async ({
  page,
}) => {
  await openLocalTrack(page, 'One\nTwo\nThree');

  const stampButton = page.getByRole('button', { name: 'Stamp line start' });
  await focusWithKeyboard(stampButton);
  await page.keyboard.press('Space');
  await expect(captureState(page)).toHaveText('Capturing');
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await setPlaybackPosition(page, 3_000);
  const finishButton = page.getByRole('button', { name: 'Finish line' });
  await focusWithKeyboard(finishButton);
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('status').filter({
      hasText: 'Line finished. The next stamp will start the next untimed line.',
    }),
  ).toBeVisible();

  await page.getByRole('listitem').nth(1).getByRole('button', { name: 'Edit lyric text' }).click();
  const lyricInput = page.getByRole('textbox', { name: 'Edit lyric text' });
  await expect(lyricInput).toBeFocused();
  await lyricInput.pressSequentially('sf ');
  await expect(lyricInput).toHaveValue('sf ');
  await expect(captureState(page)).toHaveText('Ready');
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await lyricInput.press('Escape');

  await page.getByRole('button', { name: 'One from 00:00.000 to 00:03.000' }).click();
  await page.getByRole('textbox', { name: 'Start' }).click();
  await page.keyboard.press('s');
  await page.keyboard.press('f');
  await page.keyboard.press('Space');
  await expect(captureState(page)).toHaveText('Ready');
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await page.getByLabel('Playback speed').selectOption('0.5');
  await page.getByLabel('Playback speed').press('s');
  await expect(captureState(page)).toHaveText('Ready');
  await expect(page.getByRole('heading', { name: 'Two' })).toBeVisible();

  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const shortcutsDialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(shortcutsDialog).toBeVisible();
  await page.keyboard.press('s');
  await page.keyboard.press('f');
  await expect(shortcutsDialog).toBeVisible();
  await expect(captureState(page)).toHaveText('Ready');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(shortcutsDialog).toHaveCount(0);
  await expect(captureState(page)).toHaveText('Ready');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  const playButton = page.getByRole('button', { name: 'Play' });
  await focusWithKeyboard(playButton);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

function captureState(page: Page) {
  return page.locator('.capture-state-label');
}

async function attachClickCounter(locator: Locator): Promise<void> {
  await locator.evaluate((node) => {
    const element = node as HTMLElement;
    element.dataset.clickCount = '0';
    element.addEventListener('click', () => {
      element.dataset.clickCount = String(Number(element.dataset.clickCount ?? '0') + 1);
    });
  });
}

async function readClickCount(locator: Locator): Promise<number> {
  return locator.evaluate((node) => Number((node as HTMLElement).dataset.clickCount ?? '0'));
}

async function focusWithKeyboard(locator: Locator): Promise<void> {
  await locator.evaluate((node) => (node as HTMLElement).focus());
  await locator.page().keyboard.press('Shift+Tab');
  await locator.page().keyboard.press('Tab');
  await expect(locator).toBeFocused();
}

async function dispatchRepeatedKey(page: Page, code: 'KeyS' | 'KeyF' | 'Space'): Promise<void> {
  await page.evaluate((nextCode) => {
    const target = document.activeElement ?? document.body;
    const key = nextCode === 'Space' ? ' ' : nextCode.slice(-1).toLowerCase();
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        code: nextCode,
        repeat: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, code);
}
