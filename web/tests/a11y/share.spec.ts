import { test, expectNoA11yViolations } from './fixtures';

test('share dialog is accessible', async ({ page }) => {
  await page.goto('/w/ap-invoices/browse');
  await page.getByText('Accounts Payable').click();
  await page.getByText('invoice-001.pdf').click();
  await page.getByRole('button', { name: /^share$/i }).click();
  await page.getByRole('dialog').waitFor();
  await expectNoA11yViolations(page);
});
