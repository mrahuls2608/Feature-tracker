const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ART = path.join(__dirname, '.artifacts');
fs.mkdirSync(path.join(ART, 'shots'), { recursive: true });

const { execSync } = require('child_process');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror ${page.url()}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[console ${page.url()}] ${m.text()}`));
  const B = 'http://localhost:3000';
  const email = `pm${Date.now()}@acme.io`;
  await page.goto(`${B}/register`);
  await page.fill('input[autocomplete=name]', 'Priya PM');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'Sup3rSecurePass');
  await page.click('button[type=submit]');
  await page.waitForURL('**/onboarding');
  await page.fill('input', 'Acme Commerce');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Create your first project');
  await page.click('button[type=submit]');
  await page.waitForURL('**/docs**');
  await page.screenshot({ path: ART + '/shots/docs.png' });
  // create API key in Development
  await page.goto(`${B}/api-keys`);
  await page.click('text=Create key');
  await page.fill('.fixed input', 'Demo store');
  await page.click('.fixed button:has-text("Create key")');
  await page.waitForSelector('text=Copy your API key');
  const key = (await page.textContent('.fixed code')).trim();
  console.log('KEY', key);
  await page.screenshot({ path: ART + '/shots/apikey.png' });
  await page.click('text=I\'ve stored it safely');
  execSync(`cd ${path.join(__dirname, '../examples/demo-store')} && FEATURETRACK_API_KEY=${key} node simulate.js --users 250 --days 45`, { stdio: 'inherit' });
  await page.waitForTimeout(2000);
  const pages = ['dashboard', 'live', 'events', 'events?tab=history', 'events/checkout_started', 'analytics', 'analytics?tab=engagement', 'analytics?tab=retention', 'funnels', 'features', 'users', 'docs', 'explorer', 'webhooks', 'projects', 'team', 'audit', 'settings', 'settings?tab=security', 'settings?tab=organization', 'settings?tab=environments', 'invitations'];
  for (const p of pages) {
    await page.goto(`${B}/${p}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${ART}/shots/${p.replace(/[?=/]/g, '_')}.png`, fullPage: false });
  }
  fs.writeFileSync(path.join(ART, 'key.txt'), key);
  fs.writeFileSync(path.join(ART, 'state.json'), JSON.stringify(await page.context().storageState()));
  console.log('ERRORS', errors.length);
  errors.slice(0, 30).forEach((e) => console.log(e));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
