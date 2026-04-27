import { test, expectNoA11yViolations } from './fixtures';

test('workspace picker is accessible (populated)', async ({ page }) => {
  await page.goto('/w');
  await page.getByRole('heading', { name: 'Workspaces' }).waitFor();
  await expectNoA11yViolations(page);
});
