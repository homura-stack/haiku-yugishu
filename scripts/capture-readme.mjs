import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'docs', 'images');
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The child server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Screenshot server did not start.');
}

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  return { page, errors };
}

async function save(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(outputDir, name),
    type: 'jpeg',
    quality: 88,
    fullPage: false,
  });
}

async function captureTitle(browser) {
  const { page, errors } = await openPage(browser);
  await save(page, 'title.jpg');
  await page.close();
  return errors;
}

async function captureNormal(browser) {
  const { page, errors } = await openPage(browser);
  await page.click('#choose-copy');
  await page.click('#choose-copy-normal');
  await page.click('#start');
  for (const [slot, mora] of [[0, 5], [1, 7], [2, 5]]) {
    await page.locator(`#hand .fuda[data-mora="${mora}"]:not(:disabled)`).first().click();
    await page.locator(`[data-slot="${slot}"]`).click();
  }
  await save(page, 'copy-normal.jpg');
  await page.close();
  return errors;
}

const fillers = {
  1: ['野', 'の'],
  2: ['雲', 'くも'],
  3: ['光', 'ひかり'],
  4: ['静けさ', 'しずけさ'],
  5: ['遠い雲', 'とおいくも'],
  6: ['夕暮れ時', 'ゆうぐれどき'],
  7: ['風の向こうへ', 'かぜのむこうへ'],
};

async function captureHard(browser) {
  const { page, errors } = await openPage(browser);
  await page.click('#choose-copy');
  await page.click('#choose-copy-hard');
  await page.click('#hard-start-button');
  const targets = [5, 7, 5];
  for (let line = 0; line < targets.length; line += 1) {
    const editor = page.locator('.hard-line-editor').nth(line);
    await editor.locator('.hard-keyword-card:not(:disabled)').first().click();
    const countText = await page.locator('.hard-line-editor').nth(line).locator('.hard-mora-count').textContent();
    const count = Number.parseInt(countText, 10);
    const missing = targets[line] - count;
    if (missing > 0 && fillers[missing]) {
      const currentEditor = page.locator('.hard-line-editor').nth(line);
      await currentEditor.getByLabel(/追加する自由語$/).fill(fillers[missing][0]);
      await currentEditor.getByLabel(/自由語の読み$/).fill(fillers[missing][1]);
      await currentEditor.locator('.hard-secondary-action').click();
    }
  }
  await save(page, 'hard-mode.jpg');
  await page.close();
  return errors;
}

async function captureMeiku(browser) {
  const { page, errors } = await openPage(browser);
  await page.click('#choose-meiku');
  await page.click('#start-meiku');
  await page.locator('#meiku-card').waitFor({ state: 'visible' });
  await save(page, 'meiku.jpg');
  await page.close();
  return errors;
}

await mkdir(outputDir, { recursive: true });
const server = spawn(process.execPath, [path.join(root, 'scripts', 'serve-static.mjs'), String(port)], {
  cwd: root,
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [
    ...await captureTitle(browser),
    ...await captureNormal(browser),
    ...await captureHard(browser),
    ...await captureMeiku(browser),
  ];
  if (errors.length) throw new Error(`Browser errors while capturing README: ${errors.join(' | ')}`);
  console.log(`README screenshots written to ${outputDir}`);
} finally {
  await browser?.close();
  server.kill();
}
