import { test, expectNoA11yViolations } from './fixtures';

test('login page is accessible', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('heading', { name: /spectra/i }).waitFor();
  await expectNoA11yViolations(page);
});
