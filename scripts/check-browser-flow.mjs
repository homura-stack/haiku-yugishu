import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const port = 4178;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['./scripts/serve-static.mjs', String(port)], {
  stdio: ['ignore', 'ignore', 'inherit'],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Static server did not start.');
}

function attachGuards(page) {
  const errors = [];
  const externalRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin)) externalRequests.push(url);
  });
  return { errors, externalRequests };
}

async function createHardModeHaiku(page, targets, lineMoras) {
  for (let line = 0; line < 3; line += 1) {
    await targets.nth(line).click();
    await targets.nth(line).waitFor({ state: 'visible' });
    const keyword = page.locator('#hard-shared-keyword-tray .hard-keyword-card:not(:disabled)').first();
    const label = await keyword.textContent();
    const keywordMora = Number(label.match(/・(\d+)音/)?.[1]);
    await keyword.click();
    const missing = lineMoras[line] - keywordMora;
    if (missing > 0) {
      const inputs = page.locator('#hard-shared-free-form input');
      await inputs.nth(0).fill('あ'.repeat(missing));
      await inputs.nth(1).fill('あ'.repeat(missing));
      await page.locator('#hard-shared-free-form .hard-secondary-action').click();
    }
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const { errors, externalRequests } = attachGuards(page);

  await page.goto(origin, { waitUntil: 'networkidle' });
  if (!await page.locator('#choose-copy').isVisible()) throw new Error('Copy mode entry is not visible.');
  if (!await page.locator('#choose-meiku').isVisible()) throw new Error('Meiku entry is not visible.');

  await page.click('#choose-copy');
  await page.click('#choose-copy-normal');
  if (!await page.locator('#intro').isVisible()) throw new Error('Normal mode entry is not visible.');
  await page.click('#back-from-copy');
  await page.click('#choose-copy-hard');
  await page.click('#hard-start-button');

  const targets = page.locator('[data-hard-line-target]');
  if (await targets.count() !== 3) throw new Error('Hard mode line selector count is invalid.');
  if (await page.locator('#hard-shared-keyword-tray .hard-keyword-card').count() !== 12) {
    throw new Error('Hard mode shared keyword tray count is invalid.');
  }

  for (let round = 0; round < 3; round += 1) {
    await createHardModeHaiku(page, targets, [5, 7, 5]);
    if (!await page.locator('#hard-submit-button').isEnabled()) throw new Error('Hard mode submit did not become enabled.');
    await page.click('#hard-submit-button');
    if (!await page.locator('#hard-round-result').isVisible()) throw new Error('Hard mode round result is not visible.');
    await page.getByRole('button', { name: round < 2 ? '次の句へ進む' : '最終結果を見る' }).click();
  }

  if (!await page.locator('#hard-final-result').isVisible()) throw new Error('Hard mode final result is not visible.');
  if (!await page.locator('#hard-final-result').textContent().then((text) => text.includes('ゲーム内一致率'))) {
    throw new Error('Hard mode result lacks the game-only label.');
  }
  if (!await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)) {
    throw new Error('Horizontal overflow at 390px.');
  }
  if (externalRequests.length) throw new Error(`Unexpected external requests: ${externalRequests.join(', ')}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('browser flow: 390px, 3 modes, hard-mode 3 rounds, no external requests, no browser errors');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
