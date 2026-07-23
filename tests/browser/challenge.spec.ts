import { devices, expect, test } from '@playwright/test';

const live = process.env.CHALLENGE_LIVE === '1';
const cpi = process.env.CHALLENGE_CPI ?? 'argus_cpi_test_UEeqk7Bk7uetxKKDxNmIdB';

test('desktop home presents pairing and keeps mobile SSO out of the way', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /one human/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run pairing demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use mobile SSO' })).toBeHidden();
  await expect(page.getByText('Device co-attestation')).toBeVisible();
});

test('phone home offers mobile SSO and opens the merchant demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Use mobile SSO' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run pairing demo' })).toBeHidden();
  await page.getByRole('button', { name: 'Use mobile SSO' }).click();
  await expect(page).toHaveURL(/\/merchant$/);
  await expect(page.getByRole('heading', { name: 'Try the SSO demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run demo' })).toBeVisible();
});

test('embed exposes Pair reticle and device handshake semantics', async ({ page }) => {
  await page.goto(
    `/embed?${new URLSearchParams({
      cpi: `${cpi}.fastpass`,
      challengeId: 'browser_visual_contract_1234',
    }).toString()}`
  );
  const module = page.locator('.aegis');
  await expect(module).toBeVisible();
  await expect(module.locator('.ax-scan')).toBeVisible();
  await expect(module.getByText('THIS DEVICE', { exact: true })).toBeVisible();
  await expect(module.getByText('YOUR PHONE', { exact: true })).toBeVisible();
  await expect(module.locator('.ax-track')).toHaveCSS('display', 'block');
  await expect(module).toHaveCSS('border-radius', '20px');
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

test('failed internal SSO return is terminal and skips approval redemption', async ({ page }) => {
  let redemptionRequests = 0;
  await page.route('**/api/sso/approval/redeem', async (route) => {
    redemptionRequests += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":"denied"}',
    });
  });
  await page.goto(
    `/merchant?${new URLSearchParams({
      complete: '1',
      status: 'failed',
      session: '11111111-1111-4111-8111-111111111111',
      cpi: `${cpi}.fastpass`,
    }).toString()}`
  );
  await expect(page.getByRole('heading', { name: 'Session could not be confirmed' })).toBeVisible();
  await expect(page.getByText('This phone did not pass the secure check.')).toBeVisible();
  expect(redemptionRequests).toBe(0);
});

test('forceauth return presents passkey and Google as peer proof choices', async ({ page }) => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: `argus-challenge:sso:${sessionId}`,
    value: {
      sessionId,
      nonce: 'browser-forceauth-nonce',
      cpi: `${cpi}.forceauth`,
      proofRequired: true,
      freshProofRequired: true,
      challengeUrl: `/sso/challenge/${sessionId}`,
      failureReturnUrl: '/merchant?status=failed',
    },
  });
  await page.goto(`/merchant/validate?session=${sessionId}&code=return-code`);
  await expect(page.getByRole('heading', { name: 'Confirm your identity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create passkey' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
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

test('live phone-classified fastpass SSO reaches an explicit terminal decision', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(!live, 'requires the deployed Challenge stack');
  if (!baseURL) throw new Error('live SSO test requires a base URL');
  const context = await browser.newContext({ ...devices['iPhone 14'], baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/merchant?assurance=fastpass');
    await page.getByRole('button', { name: 'Run demo' }).click();
    await expect(
      page.getByRole('heading', {
        name: /Session is Valid|Session could not be confirmed/,
      })
    ).toBeVisible({ timeout: 75_000 });
    await expect(page.locator('body')).not.toContainText('{"error"');
    await expect(page.locator('.spinner')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
