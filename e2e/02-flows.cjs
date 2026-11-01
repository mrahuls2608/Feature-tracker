const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ART = path.join(__dirname, '.artifacts');
fs.mkdirSync(path.join(ART, 'shots'), { recursive: true });

const http = require('http');
(async () => {
  const key = fs.readFileSync(path.join(ART, 'key.txt'), 'utf8').trim();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.join(ART, 'state.json'), viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror ${page.url()}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(`[console ${page.url()}] ${m.text()}`));
  const B = 'http://localhost:3000';
  const ok = (m) => console.log('✓', m);

  // 1. Live stream receives a brand-new event without refresh
  await page.goto(`${B}/live`);
  await page.waitForSelector('text=Live', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const name = `live_probe_${Date.now()}`;
  await fetch('http://localhost:4000/v1/track', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ event: name, distinctId: 'probe_user', properties: { probe: true } }) });
  await page.waitForSelector(`text=${name}`, { timeout: 8000 });
  ok('live event appeared without refresh');
  await page.click('button:has-text("Pause")');
  const name2 = `${name}_paused`;
  await fetch('http://localhost:4000/v1/track', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ event: name2, distinctId: 'probe_user' }) });
  await page.waitForSelector('button:has-text("Resume (1 new)")', { timeout: 8000 });
  await page.click('button:has-text("Resume")');
  await page.waitForSelector(`text=${name2}`);
  ok('pause buffers and resume flushes');
  await page.click(`text=${name}`);
  await page.waitForSelector('text=Message ID');
  await page.screenshot({ path: ART + '/shots/flow_live_drawer.png' });
  await page.keyboard.press('Escape');

  // 2. Create a feature via UI
  await page.goto(`${B}/features`);
  await page.click('button:has-text("New feature")');
  await page.fill('input[placeholder="New Checkout Experience"]', 'New Checkout Experience ' + (Date.now() % 1000));
  await page.selectOption('.fixed select >> nth=0', 'beta');
  await page.selectOption('.fixed select >> nth=-1', 'payment_completed');
  await page.click('.fixed button:has-text("Save")');
  await page.waitForURL('**/features/*');
  await page.waitForSelector('text=Adoption rate');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: ART + '/shots/flow_feature.png', fullPage: true });
  ok('feature created; detail page with metrics');
  // enable rollout in Development
  await page.click('[aria-label="Enable in Development"]');
  await page.click('button:has-text("Save rollout")');
  await page.waitForSelector('text=Rollout saved');
  ok('rollout saved');

  // 3. Funnel builder with live preview
  await page.goto(`${B}/funnels`);
  await page.click('button:has-text("New funnel")');
  await page.fill('input[placeholder="Checkout conversion"]', 'Checkout conversion');
  await page.selectOption('.fixed li >> nth=0 >> select', 'user_signed_up');
  await page.selectOption('.fixed li >> nth=1 >> select', 'product_viewed');
  await page.click('.fixed button:has-text("Add step")');
  await page.selectOption('.fixed li >> nth=2 >> select', 'checkout_started');
  await page.click('.fixed button:has-text("Add step")');
  await page.selectOption('.fixed li >> nth=3 >> select', 'payment_completed');
  await page.waitForSelector('text=Overall conversion', { timeout: 8000 });
  await page.click('.fixed button:has-text("Create funnel")');
  await page.waitForURL('**/funnels/*');
  await page.waitForSelector('text=Biggest drop-off');
  await page.waitForTimeout(800);
  await page.screenshot({ path: ART + '/shots/flow_funnel.png', fullPage: true });
  ok('funnel created and computed');

  // 4. Webhook to a local receiver, send test, see success
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push(b); res.end('ok'); }); }).listen(4567);
  await page.goto(`${B}/webhooks`);
  await page.click('button:has-text("Add endpoint")');
  await page.fill('input[placeholder^="https://example.com"]', 'http://127.0.0.1:4567/hook');
  await page.click('.fixed button:has-text("Save")');
  await page.waitForSelector('text=Signing secret');
  await page.click('button:has-text("Done")');
  await page.click('text=http://127.0.0.1:4567/hook');
  await page.click('button:has-text("Send test")');
  await page.waitForSelector('td >> text=succeeded', { timeout: 15000 });
  await page.screenshot({ path: ART + '/shots/flow_webhook.png' });
  ok(`webhook delivered (${got.length} received)`);
  srv.close();

  // 5. API explorer real request
  await page.goto(`${B}/explorer`);
  await page.fill('input[placeholder="ft_dev_…"]', key);
  await page.click('button:has-text("Send request")');
  await page.waitForSelector('text=accepted');
  await page.screenshot({ path: ART + '/shots/flow_explorer.png' });
  ok('explorer executed real request');

  // 6. Invite a viewer, accept in another browser context, verify read-only UI
  await page.goto(`${B}/team`);
  await page.click('button:has-text("Invite member")');
  const vemail = `viewer${Date.now()}@acme.io`;
  await page.fill('.fixed input[type=email]', vemail);
  await page.selectOption('.fixed select', 'viewer');
  await page.click('.fixed button:has-text("Send invitation")');
  await page.waitForSelector('text=Invitation created');
  const link = (await page.textContent('.fixed code')).trim();
  const vctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const v = await vctx.newPage();
  v.on('pageerror', (e) => errors.push(`[viewer pageerror] ${e.message}`));
  await v.goto(link);
  await v.click('text=Create account');
  await v.fill('input[autocomplete=name]', 'Vera Viewer');
  await v.fill('input[type=email]', vemail);
  await v.fill('input[type=password]', 'Sup3rSecurePass');
  await v.click('button[type=submit]');
  await v.waitForURL('**/invite/**');
  await v.click('button:has-text("Accept invitation")');
  await v.waitForURL('**/dashboard');
  await v.waitForSelector('text=Total events');
  const navKeys = await v.locator('nav >> text=API keys').count();
  await v.goto(`${B}/features`);
  await v.waitForSelector('text=Adoption');
  const newBtn = await v.locator('button:has-text("New feature")').count();
  ok(`viewer joined; API keys nav visible=${navKeys}, New feature button visible=${newBtn}`);
  await v.screenshot({ path: ART + '/shots/flow_viewer.png' });

  // 7. Audit log shows actions
  await page.goto(`${B}/audit`);
  await page.waitForSelector('text=invitation.accepted');
  await page.screenshot({ path: ART + '/shots/flow_audit.png' });
  ok('audit log lists invitation.accepted');

  // 8. Dark mode + mobile
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${B}/dashboard`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: ART + '/shots/flow_dark.png' });
  const m = await browser.newContext({ storageState: await ctx.storageState(), viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  await mp.goto(`${B}/dashboard`);
  await mp.waitForTimeout(2000);
  await mp.screenshot({ path: ART + '/shots/flow_mobile.png' });
  const overflow = await mp.evaluate(() => document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth);
  ok(`mobile horizontal overflow=${overflow}`);

  console.log('ERRORS', errors.length);
  errors.slice(0, 20).forEach((e) => console.log(e));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
