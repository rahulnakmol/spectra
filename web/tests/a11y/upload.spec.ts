import { test, expectNoA11yViolations } from './fixtures';

test('upload wizard is accessible (initial step)', async ({ page }) => {
  await page.goto('/w/ap-invoices/upload');
  await page.getByRole('button', { name: /browse files/i }).waitFor();
  await expectNoA11yViolations(page);
});
