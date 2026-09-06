import { test, expect } from '@playwright/test';

/**
 * There is deliberately one test. Its job is to prove the harness works - dev
 * servers up, proxy wired, token accepted, React rendering - and nothing about
 * how the UI should behave. That part is yours.
 */
test('the app loads and shows the track title', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Load a track to begin timing lyrics.' }),
  ).toBeVisible();
});
