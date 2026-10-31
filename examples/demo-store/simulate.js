// Commerce Platform simulator — a separate application integrated with FeatureTrack via the SDK.
//
//   FEATURETRACK_API_KEY=ft_dev_xxx node simulate.js               # backfill 30 days of journeys
//   FEATURETRACK_API_KEY=ft_dev_xxx node simulate.js --live        # stream live traffic forever
//   options: --users 300 --days 30 --host http://localhost:4000
import { FeatureTrack } from '@featuretrack/sdk';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null)).filter(Boolean));
const apiKey = process.env.FEATURETRACK_API_KEY || args.key;
const host = process.env.FEATURETRACK_HOST || args.host || 'http://localhost:4000';
if (!apiKey) {
  console.error('Set FEATURETRACK_API_KEY (create one under API Keys in the dashboard).');
  process.exit(1);
}

const ft = new FeatureTrack({ apiKey, host, flushAt: 100, flushInterval: 1000, onError: (e) => console.error('FeatureTrack error:', e.message) });

const PRODUCTS = [
  { id: 'sku_101', name: 'Wireless Headphones', price: 129, category: 'audio' },
  { id: 'sku_102', name: 'Mechanical Keyboard', price: 99, category: 'accessories' },
  { id: 'sku_103', name: '4K Monitor', price: 349, category: 'displays' },
  { id: 'sku_104', name: 'USB-C Hub', price: 49, category: 'accessories' },
  { id: 'sku_105', name: 'Smart Watch', price: 199, category: 'wearables' },
  { id: 'sku_106', name: 'Portable Speaker', price: 79, category: 'audio' },
];
const PLANS = ['free', 'free', 'free', 'pro', 'pro', 'business'];
const COUNTRIES = ['US', 'US', 'GB', 'DE', 'IN', 'BR', 'CA', 'FR'];
const SOURCES = ['google', 'newsletter', 'twitter', 'direct', 'partner'];
const FIRST = ['Ava', 'Liam', 'Noah', 'Emma', 'Mia', 'Lucas', 'Zoe', 'Ethan', 'Aria', 'Leo', 'Ivy', 'Kai', 'Nora', 'Omar', 'Priya', 'Sofia'];
const LAST = ['Smith', 'Patel', 'Garcia', 'Kim', 'Müller', 'Silva', 'Brown', 'Nguyen', 'Khan', 'Rossi'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const minutes = (n) => n * 60_000;

async function journey(userIndex, start, { live = false } = {}) {
  const id = `user_${String(userIndex).padStart(5, '0')}`;
  const first = pick(FIRST);
  const last = pick(LAST);
  const plan = pick(PLANS);
  const country = pick(COUNTRIES);
  let t = start.getTime();
  const at = () => (live ? new Date() : new Date(t));
  const step = (min) => (t += minutes(min * (0.5 + Math.random())));
  const opts = () => ({ distinctId: id, timestamp: at() });

  ft.identify(id, { email: `${first}.${last}${userIndex}@example.com`.toLowerCase(), name: `${first} ${last}`, plan, country, signup_source: pick(SOURCES) });
  ft.track('user_signed_up', { plan, country, source: pick(SOURCES) }, opts());

  // Feature flag: "new-checkout" (falls back to a 50/50 split if no rollout is configured).
  let newCheckout;
  try {
    const flags = await ft.getFlags({ distinctId: id, properties: { plan, country } });
    newCheckout = 'new-checkout' in flags ? flags['new-checkout'] : userIndex % 2 === 0;
  } catch {
    newCheckout = userIndex % 2 === 0;
  }

  const sessions = 1 + (chance(0.55) ? Math.floor(Math.random() * 6) : 0);
  for (let s = 0; s < sessions; s++) {
    if (s > 0) {
      t += minutes(60 * 24 * (0.5 + Math.random() * 3));
      if (!live && t > Date.now()) break;
      ft.track('login_completed', { method: pick(['password', 'google', 'magic_link']) }, opts());
    }
    if (chance(0.25)) {
      ft.featureExposed('dark-mode', { surface: 'settings' }, opts());
      if (chance(0.6)) ft.featureUsed('dark-mode', { theme: 'dark' }, opts());
    }
    if (chance(0.3)) {
      step(1);
      ft.featureExposed('ai-recommendations', { placement: 'home' }, opts());
      if (chance(0.45)) ft.track('recommendation_clicked', { product_id: pick(PRODUCTS).id }, opts());
    }
    if (!chance(0.88)) continue;
    const views = 1 + Math.floor(Math.random() * 4);
    let product;
    for (let v = 0; v < views; v++) {
      product = pick(PRODUCTS);
      step(2);
      ft.track('product_viewed', { product_id: product.id, product_name: product.name, category: product.category, price: product.price }, opts());
    }
    if (!chance(0.55)) continue;
    step(1);
    const qty = 1 + Math.floor(Math.random() * 2);
    ft.track('add_to_cart', { product_id: product.id, price: product.price, quantity: qty }, opts());
    if (!chance(0.7)) continue;
    step(2);
    const cartValue = product.price * qty;
    if (newCheckout) ft.featureExposed('new-checkout', { variant: 'v2' }, opts());
    // Some exposed users go back to the classic flow; the rest use (adopt) the new checkout.
    const adopts = newCheckout && chance(0.8);
    if (adopts) ft.featureUsed('new-checkout', { variant: 'v2', one_click: chance(0.4) }, opts());
    ft.track('checkout_started', { cart_value: cartValue, items: qty, checkout_version: adopts ? 'v2' : 'v1' }, opts());
    // The new checkout converts noticeably better — visible in feature conversion comparison.
    const payRate = adopts ? 0.72 : 0.48;
    if (!chance(payRate)) {
      if (chance(0.3)) ft.track('checkout_abandoned', { step: pick(['shipping', 'payment', 'review']), cart_value: cartValue }, opts());
      continue;
    }
    step(3);
    ft.track('payment_completed', { amount: cartValue, currency: 'USD', method: pick(['card', 'card', 'paypal', 'apple_pay']), plan }, opts());
    if (plan !== 'free' && chance(0.04)) {
      step(60 * 24);
      ft.track('subscription_cancelled', { plan, reason: pick(['price', 'missing_feature', 'switched']) }, opts());
    }
  }
}

if (args.live) {
  let i = Math.floor(Math.random() * 90000) + 10000;
  console.log(`Streaming live traffic to ${host} — Ctrl+C to stop`);
  const tick = async () => {
    await journey(i++, new Date(), { live: true });
    await ft.flush();
  };
  setInterval(() => tick().catch((e) => console.error(e.message)), 1500);
  process.on('SIGINT', async () => {
    await ft.shutdown();
    process.exit(0);
  });
} else {
  const users = Number(args.users || 300);
  const days = Number(args.days || 30);
  console.log(`Simulating ${users} customers over ${days} days → ${host}`);
  for (let u = 0; u < users; u++) {
    // Signups grow over time so the dashboard shows a growth trend.
    const skew = Math.sqrt(Math.random());
    const start = new Date(Date.now() - days * 86400_000 + skew * (days - 0.2) * 86400_000);
    await journey(u + 1, start);
    if (u % 25 === 24) {
      await ft.flush();
      process.stdout.write(`  ${u + 1}/${users} users\r`);
    }
  }
  await ft.shutdown();
  console.log(`\nDone. Open the dashboard to explore events, funnels and feature adoption.`);
}
