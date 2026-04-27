import { test, expectNoA11yViolations } from './fixtures';

const tabs = ['workspaces', 'groups', 'audit'] as const;

for (const tab of tabs) {
  test(`admin ${tab} tab is accessible`, async ({ page }) => {
    await page.goto(`/w/ap-invoices/admin/${tab}`);
    await page.getByRole('heading', { name: /admin/i }).waitFor();
    await expectNoA11yViolations(page);
  });
}
