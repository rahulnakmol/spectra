import { test, expectNoA11yViolations } from './fixtures';

test('browse page is accessible (empty selection)', async ({ page }) => {
  await page.goto('/w/ap-invoices/browse');
  await page.getByRole('navigation', { name: 'Folders' }).waitFor();
  await expectNoA11yViolations(page);
});

test('browse page is accessible after selecting team folder', async ({ page }) => {
  await page.goto('/w/ap-invoices/browse');
  await page.getByText('Accounts Payable').click();
  await page.getByText('invoice-001.pdf').waitFor();
  await expectNoA11yViolations(page);
});
