import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const errors = [];
const networkRequests = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) networkRequests.push(request.url());
  });

  await page.goto(pathToFileURL(`${process.cwd()}/index.html`).href, { waitUntil: 'load' });
  await page.click('#choose-copy');
  await page.click('#choose-copy-hard');
  if (!await page.locator('#hard-mode-shell').isVisible()) throw new Error('Hard mode is not visible in file mode.');
  await page.click('#back-from-hard');
  await page.click('#choose-copy-normal');
  if (!await page.locator('#intro').isVisible()) throw new Error('Normal mode intro is not visible in file mode.');
  await page.click('#back-from-copy');
  await page.click('#back-from-copy-select');
  await page.click('#choose-meiku');
  if (!await page.locator('#meiku-intro').isVisible()) throw new Error('Meiku intro is not visible in file mode.');
  if (networkRequests.length) throw new Error(`Unexpected external requests: ${networkRequests.join(', ')}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('file:// mode: 3 routes, no external requests, no browser errors');
} finally {
  await browser.close();
}
