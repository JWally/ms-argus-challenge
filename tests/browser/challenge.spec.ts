import { expect, test } from '@playwright/test';

const live = process.env.CHALLENGE_LIVE === '1';
const cpi = process.env.CHALLENGE_CPI ?? 'argus_cpi_test_UEeqk7Bk7uetxKKDxNmIdB';

test('home presents the explicit two-device challenge', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /one human/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run a demo' })).toBeVisible();
  await expect(page.getByText('Device co-attestation')).toBeVisible();
});

test('invalid embed configuration fails explicitly', async ({ page }) => {
  await page.goto('/embed?cpi=not-a-cpi&challengeId=short');
  await expect(page.getByText('Invalid challenge configuration.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('{"error"');
});

test('SSO callback with missing return material never hangs or exposes JSON', async ({ page }) => {
  await page.goto('/merchant/validate');
  await expect(page.getByRole('heading', { name: 'Sign-in needs attention' })).toBeVisible();
  await expect(page.getByText('The secure return material is missing.')).toBeVisible();
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('{"error"');
});

test('loader mounts once, destroys cleanly, and remounts', async ({ page, baseURL }) => {
  test.skip(!live, 'loader artifact is exercised from the deployed site');
  const challengeOrigin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  await page.route('https://merchant.challenge.test/', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><div id="mount"></div><script src="${challengeOrigin}/captcha.js" data-embed-origin="${challengeOrigin}"></script></body></html>`,
    });
  });
  await page.goto('https://merchant.challenge.test/');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { argusCaptcha?: unknown }).argusCaptcha)
  );
  const result = await page.evaluate(
    ({ activeCpi }) => {
      const browser = window as unknown as {
        argusCaptcha: {
          render(
            element: Element,
            options: { cpi: string; challengeId: string }
          ): { destroy(): void } | null;
        };
      };
      const mount = document.querySelector('#mount');
      if (!mount) throw new Error('missing_mount');
      const options = { cpi: `${activeCpi}.fastpass`, challengeId: 'browser_contract_1234' };
      const first = browser.argusCaptcha.render(mount, options);
      const second = browser.argusCaptcha.render(mount, options);
      const firstSource = mount.querySelector('iframe')?.getAttribute('src');
      first?.destroy();
      const third = browser.argusCaptcha.render(mount, options);
      const remounted = mount.querySelectorAll('iframe').length;
      third?.destroy();
      return { first: Boolean(first), second: Boolean(second), firstSource, remounted };
    },
    { activeCpi: cpi }
  );
  expect(result).toMatchObject({ first: true, second: false, remounted: 1 });
  expect(result.firstSource).toContain(`${challengeOrigin}/embed?`);
  expect(result.firstSource).toContain('origin=https%3A%2F%2Fmerchant.challenge.test');
});

test('live browser reaches an encrypted QR through real Argus and AWS infrastructure', async ({
  page,
}) => {
  test.skip(!live, 'requires the deployed Challenge stack');
  const parameters = new URLSearchParams({
    cpi: `${cpi}.fastpass`,
    challengeId: `browser_${crypto.randomUUID().replaceAll('-', '')}`,
  });
  await page.goto(`/embed?${parameters.toString()}`);
  await expect(page.getByRole('img', { name: /secure QR code/i })).toBeVisible({ timeout: 75_000 });
  await expect(page.getByRole('heading', { name: 'Scan with your phone' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
