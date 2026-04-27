import { test, expectNoA11yViolations } from './fixtures';

test('agent flyout is accessible when open', async ({ page }) => {
  await page.goto('/w');
  await page.getByRole('button', { name: /open assistant/i }).click();
  await page.getByText(/coming soon/i).waitFor();
  await expectNoA11yViolations(page);
});
