import { test, expect } from '@playwright/test';
import { openLocalTrack } from './helpers/track';

test('bundled sample loads and plays without API requests', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  const manifest = await page.request.get('/demo/track.json');
  expect(manifest.ok()).toBeTruthy();
  const track = await manifest.json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample' }).click();
  await expect(page.getByText(track.title, { exact: true })).toBeVisible();
  await page.locator('audio').evaluate(async node => {
    await (node as HTMLAudioElement).play();
  });
  await expect.poll(() => page.locator('audio').evaluate(node => (node as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  expect(apiRequests).toEqual([]);
});

test('sample download failure still allows local import', async ({ page }) => {
  await page.route('**/demo/track.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample' }).click();
  await expect(page.getByText(/sample track could not be loaded \(503\)/)).toBeVisible();
  await openLocalTrack(page, 'First line\nSecond line');
  await expect(page.getByText('test-track.wav', { exact: true })).toBeVisible();
});
