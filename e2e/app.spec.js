import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

function captureErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function openNormalMode(page) {
  await page.click('#choose-copy');
  await page.click('#choose-copy-normal');
  await page.click('#start');
  await expect(page.locator('#compose')).toBeVisible();
}

test('3モード導線と通常モードのドラッグ・キーボード・二度の完走', async ({ page }) => {
  const errors = captureErrors(page);
  await page.clock.install();
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.click('#choose-copy');
  await page.click('#choose-copy-hard');
  await expect(page.locator('#hard-mode-shell')).toBeVisible();
  await page.click('#back-from-hard');
  await page.click('#choose-copy-normal');
  await page.click('#start');

  const dragCard = page.locator('#hand .fuda[data-mora="5"]:not(:disabled)').first();
  await dragCard.scrollIntoViewIfNeeded();
  const dragBox = await dragCard.boundingBox();
  const upperBox = await page.locator('[data-slot="0"]').boundingBox();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(upperBox.x + upperBox.width / 2, upperBox.y + upperBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-slot="0"]')).toHaveAttribute('data-card-id', /.+/);

  const lowerCard = page.locator('#hand .fuda[data-mora="5"]:not(:disabled)').first();
  await lowerCard.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-slot="2"]').focus();
  await page.keyboard.press('Enter');
  const middleCard = page.locator('#hand .fuda[data-mora="7"]:not(:disabled)').first();
  await middleCard.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-slot="1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#submit')).toBeEnabled();
  await page.click('#submit');

  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#back-from-copy-game');
  for (let run = 0; run < 2; run += 1) {
    await page.click('#choose-copy-normal');
    await page.click('#start');
    await page.clock.runFor(90_000);
    await expect(page.locator('#timeup')).toBeVisible();
    await page.click('#show-results');
    await expect(page.locator('#results h2')).toBeVisible();
    if (run === 0) await page.locator('#results .app-secondary-action').click();
  }
  expect(errors).toEqual([]);
});

test('保存不能でも通常モードの結果を表示する', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'copipe-haiku:history') throw new Error('storage denied');
      return original.call(this, key, value);
    };
  });
  await page.clock.install();
  await page.goto('/', { waitUntil: 'networkidle' });
  await openNormalMode(page);
  await page.clock.runFor(90_000);
  await page.click('#show-results');
  await expect(page.locator('#results h2')).toBeVisible();
  await expect(page.locator('.storage-warning')).toBeVisible();
});

test('名句斬りは誤答後にロックし次問で残り時間を初期化する', async ({ page }) => {
  await page.clock.install();
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.click('#choose-meiku');
  await page.check('input[name="meiku-level"][value="hard"]');
  await page.click('#start-meiku');
  await expect(page.locator('#meiku-remaining')).toHaveText('16');

  const input = page.locator('#meiku-input');
  await input.fill('wrong');
  await input.press('Enter');
  await expect(page.locator('#meiku-feedback')).toHaveClass(/is-wrong/);
  await expect(page.locator('#meiku-remaining')).toHaveText('—');
  const feedback = await page.locator('#meiku-feedback').textContent();
  await input.fill('wrong-again');
  await input.press('Enter');
  await expect(page.locator('#meiku-feedback')).toHaveText(feedback);

  await page.clock.runFor(1_500);
  await expect(page.locator('#meiku-progress')).toHaveText('2 / 10');
  await expect(page.locator('#meiku-remaining')).toHaveText('16');
});

test.describe('動きの抑制', () => {
  test.use({ reducedMotion: 'reduce' });

  test('名句札を固定し11秒で時間切れにする', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.click('#choose-meiku');
    await page.click('#start-meiku');
    await expect(page.locator('#meiku-remaining')).toHaveText('11');
    await expect(page.locator('#meiku-card')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('#meiku-card')).toHaveCSS('opacity', '1');
    await page.clock.runFor(11_000);
    await expect(page.locator('#meiku-card')).toHaveClass(/is-missed/);
    await expect(page.locator('#meiku-remaining')).toHaveText('—');
  });
});

test('390pxで横スクロールせず札をタップ配置できる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await openNormalMode(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator('.copy-slot-dock')).toBeVisible();
  await page.locator('#hand .fuda[data-mora="5"]:not(:disabled)').first().click();
  await page.locator('[data-slot="0"]').click();
  await expect(page.locator('[data-slot="0"]')).toHaveAttribute('data-card-id', /.+/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#back-from-copy-game');
  await page.click('#choose-copy-hard');
  await expect(page.locator('#hard-mode-shell')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.click('#back-from-hard');
  await page.click('#back-from-copy-select');
  await page.click('#choose-meiku');
  await expect(page.locator('#meiku-intro')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('file版で3モード導線が動き外部通信とコンソールエラーがない', async ({ page }) => {
  const errors = captureErrors(page);
  const networkRequests = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) networkRequests.push(request.url());
  });
  const fileUrl = pathToFileURL(`${process.cwd()}/index.html`).href;
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.click('#choose-copy');
  await page.click('#choose-copy-hard');
  await expect(page.locator('#hard-mode-shell')).toBeVisible();
  await page.click('#back-from-hard');
  await page.click('#choose-copy-normal');
  await expect(page.locator('#intro')).toBeVisible();
  await page.click('#back-from-copy');
  await page.click('#back-from-copy-select');
  await page.click('#choose-meiku');
  await expect(page.locator('#meiku-intro')).toBeVisible();
  expect(networkRequests).toEqual([]);
  expect(errors).toEqual([]);
});
