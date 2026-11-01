const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ART = path.join(__dirname, '.artifacts');
fs.mkdirSync(path.join(ART, 'shots'), { recursive: true });

const http = require('http');
const { spawn, execSync } = require('child_process');
const OUT = path.join(__dirname, '../docs/images');
const B = 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${page.url()} ${e.message}`));
  const shot = async (name, opts = {}) => { await page.waitForTimeout(opts.wait ?? 1800); await page.screenshot({ path: `${OUT}/${name}.png`, ...opts.s }); console.log('📸', name); };

  await page.goto(`${B}/login`);
  await shot('01-login', { wait: 600 });
  await page.fill('input[type=email]', 'demo@featuretrack.dev');
  await page.fill('input[type=password]', 'DemoPassw0rd!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  await page.click('[role=radio]:has-text("Prod")');

  // Production key for the live demo-store traffic
  await page.goto(`${B}/api-keys`);
  await page.click('button:has-text("Create key")');
  await page.fill('.fixed input', 'Demo store (live)');
  await page.click('.fixed button:has-text("Create key")');
  await page.waitForSelector('text=Copy your API key');
  const key = (await page.textContent('.fixed code')).trim();
  await page.click("text=I've stored it safely");
  const ds = path.join(__dirname, '../examples/demo-store');
  execSync(`cd ${ds} && FEATURETRACK_API_KEY=${key} node simulate.js --users 60 --days 1`, { stdio: 'ignore' });
  const live = spawn('node', ['simulate.js', '--live'], { cwd: ds, env: { ...process.env, FEATURETRACK_API_KEY: key }, stdio: 'ignore' });
  await page.waitForTimeout(3000);

  await page.goto(`${B}/dashboard`);
  await shot('02-dashboard', { wait: 2500 });
  await page.goto(`${B}/live`);
  await page.waitForTimeout(6000);
  await shot('04-live-events', { wait: 500 });
  await page.click('main li >> nth=0');
  await shot('05-event-inspector', { wait: 800 });
  await page.keyboard.press('Escape');

  await page.goto(`${B}/events`);
  await shot('06-events');
  await page.goto(`${B}/events/checkout_started`);
  await shot('07-event-detail', { wait: 2500 });

  await page.goto(`${B}/analytics`);
  await page.waitForTimeout(1500);
  for (const e of ['product_viewed', 'checkout_started', 'payment_completed']) {
    await page.click('main button:has-text("All events"), main button:has-text("Add")');
    await page.click(`main [data-menu-close]:has-text("${e}")`);
    await page.waitForTimeout(400);
  }
  await page.click('main button:has-text("Unique users")');
  await shot('08-insights-trends', { wait: 2500 });
  await page.goto(`${B}/analytics?tab=engagement`);
  await shot('09-insights-engagement', { wait: 2500 });
  await page.goto(`${B}/analytics?tab=retention`);
  await shot('10-insights-retention', { wait: 2500 });

  await page.goto(`${B}/funnels`);
  await page.waitForTimeout(1200);
  await page.click('main a:has-text("Checkout conversion")');
  await page.waitForURL('**/funnels/*');
  await shot('11-funnel', { wait: 2500 });
  await page.click('button:has-text("Edit")');
  await page.waitForSelector('text=Overall conversion', { timeout: 10000 });
  await shot('12-funnel-builder', { wait: 800 });
  await page.keyboard.press('Escape');

  await page.goto(`${B}/features`);
  await shot('13-features', { wait: 2500 });
  const fhref = await page.getAttribute('main a:has-text("New Checkout Experience")', 'href');
  await page.goto(`${B}${fhref}`);
  await shot('14-feature-detail', { wait: 2500 });
  await page.locator('text=Feature flag rollout').scrollIntoViewIfNeeded();
  await page.locator('section:has-text("Feature flag rollout")').screenshot({ path: `${OUT}/15-feature-rollout.png` });
  console.log('📸 15-feature-rollout');

  await page.goto(`${B}/users`);
  await shot('16-users', { wait: 2000 });
  await page.click('main tbody tr >> nth=0');
  await page.waitForURL('**/users/*');
  await shot('17-user-profile', { wait: 2500 });

  await page.goto(`${B}/api-keys`);
  await shot('18-api-keys', { wait: 2000 });
  await page.goto(`${B}/docs`);
  await shot('19-sdk-docs', { wait: 1000 });
  await page.goto(`${B}/explorer`);
  await page.waitForTimeout(1200);
  await page.fill('input[placeholder="ft_dev_…"]', key);
  await page.click('button:has-text("Send request")');
  await page.waitForSelector('text=accepted');
  await page.locator('text=Response').scrollIntoViewIfNeeded();
  await shot('20-api-explorer', { wait: 600 });

  // Webhook → local receiver
  const srv = http.createServer((req, res) => { req.resume(); req.on('end', () => res.end('ok')); }).listen(4568);
  await page.goto(`${B}/webhooks`);
  await page.click('button:has-text("Add endpoint")');
  await page.fill('input[placeholder^="https://example.com"]', 'http://127.0.0.1:4568/featuretrack');
  await page.fill('input[placeholder="Notify billing service"]', 'Billing service — paid orders');
  await page.click('.fixed button:has-text("Save")');
  await page.waitForSelector('text=Signing secret');
  await page.click('button:has-text("Done")');
  await page.click('text=http://127.0.0.1:4568/featuretrack');
  await page.waitForURL('**/webhooks/*');
  const hookUrl = page.url();
  await page.click('button:has-text("Send test")');
  await page.waitForSelector('td >> text=succeeded', { timeout: 20000 });
  await page.waitForTimeout(6000);
  await shot('21-webhook-deliveries', { wait: 500 });

  await page.goto(`${B}/team`);
  await shot('22-team');
  await page.goto(`${B}/audit`);
  await shot('23-audit-log');
  await page.goto(`${B}/projects`);
  await shot('24-projects');
  await page.goto(`${B}/settings?tab=security`);
  await shot('25-settings-security');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${B}/dashboard`);
  await shot('03-dashboard-dark', { wait: 2500 });
  await page.emulateMedia({ colorScheme: 'light' });

  // Mobile with its own fresh login
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  await mp.goto(`${B}/login`);
  await mp.fill('input[type=email]', 'demo@featuretrack.dev');
  await mp.fill('input[type=password]', 'DemoPassw0rd!');
  await mp.click('button[type=submit]');
  await mp.waitForURL('**/dashboard');
  await mp.waitForTimeout(3000);
  const overflow = await mp.evaluate(() => document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth);
  await mp.screenshot({ path: `${OUT}/26-mobile.png` });
  console.log('📸 26-mobile, horizontal overflow =', overflow);

  // Clean up: stop traffic, remove the demo webhook
  live.kill('SIGINT');
  const hookId = hookUrl.split('/').pop();
    await page.goto(hookUrl);
  await page.click('button:has-text("Delete")');
  await page.click('.fixed button:has-text("Delete webhook")');
  await page.waitForURL('**/webhooks');
  srv.close();
  console.log('errors', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
