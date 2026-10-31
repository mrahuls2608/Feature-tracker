// Seeds a demo workspace: owner + team, "Commerce Platform" project, API keys, features,
// funnel, webhook-free setup — then generates realistic traffic through the real ingestion API.
//
//   npm run seed            (API must be running on PUBLIC_API_URL, default http://localhost:4000)
import bcrypt from 'bcryptjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { config } from '../src/config.js';
import { User, Organization, Membership, Project, Environment, ApiKey, Feature, Funnel, EventDefinition } from '../src/models/index.js';
import { createProjectWithEnvironments } from '../src/routes/projects.js';
import { generateApiKey } from '../src/services/ingest.js';
import { closeRedis } from '../src/lib/redis.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEMO = { email: 'demo@featuretrack.dev', password: 'DemoPassw0rd!', name: 'Demo Owner' };

await connectDb();
let owner = await User.findOne({ email: DEMO.email });
if (owner) {
  console.log(`Demo user already exists (${DEMO.email}). Delete it to reseed.`);
  await disconnectDb();
  await closeRedis();
  process.exit(0);
}
const hash = await bcrypt.hash(DEMO.password, 12);
owner = await User.create({ email: DEMO.email, name: DEMO.name, passwordHash: hash });
const team = await User.insertMany([
  { email: 'dev@featuretrack.dev', name: 'Dana Developer', passwordHash: hash },
  { email: 'pm@featuretrack.dev', name: 'Priya Product', passwordHash: hash },
]);
const org = await Organization.create({ name: 'Acme Commerce', slug: `acme-commerce-${Date.now().toString(36)}`, createdBy: owner._id });
await Membership.insertMany([
  { org: org._id, user: owner._id, role: 'owner' },
  { org: org._id, user: team[0]._id, role: 'developer' },
  { org: org._id, user: team[1]._id, role: 'viewer' },
]);
const { project, environments } = await createProjectWithEnvironments(org, owner, { name: 'Commerce Platform', description: 'Web storefront and checkout' });
const prod = environments.find((e) => e.type === 'production');
const { raw, hash: keyHash, prefix, last4 } = generateApiKey('production');
await ApiKey.create({ org: org._id, project: project._id, environment: prod._id, name: 'Storefront (seed)', prefix, last4, keyHash, createdBy: owner._id });

await EventDefinition.insertMany([
  { org: org._id, project: project._id, name: 'user_signed_up', displayName: 'User Signed Up', description: 'A visitor created an account', category: 'acquisition', properties: [{ name: 'plan', type: 'string' }, { name: 'source', type: 'string' }] },
  { org: org._id, project: project._id, name: 'product_viewed', displayName: 'Product Viewed', description: 'Product detail page viewed', category: 'catalog', properties: [{ name: 'product_id', type: 'string', required: true }, { name: 'price', type: 'number' }] },
  { org: org._id, project: project._id, name: 'checkout_started', displayName: 'Checkout Started', description: 'User opened checkout', category: 'checkout', properties: [{ name: 'cart_value', type: 'number', required: true }] },
  { org: org._id, project: project._id, name: 'payment_completed', displayName: 'Payment Completed', description: 'Order paid successfully', category: 'checkout', properties: [{ name: 'amount', type: 'number', required: true }, { name: 'currency', type: 'string' }] },
]);
await Feature.insertMany([
  { org: org._id, project: project._id, key: 'new-checkout', name: 'New Checkout Experience', description: 'Single-page checkout with one-click payments', status: 'beta', conversionEvent: 'payment_completed', tags: ['checkout'], rollouts: environments.map((e) => ({ environment: e._id, enabled: true, percentage: 50, rules: [] })) },
  { org: org._id, project: project._id, key: 'dark-mode', name: 'Dark Mode', status: 'live', tags: ['ui'] },
  { org: org._id, project: project._id, key: 'ai-recommendations', name: 'AI Recommendations', status: 'beta', adoptionEvents: ['recommendation_clicked'], conversionEvent: 'payment_completed' },
]);
await Funnel.create({ org: org._id, project: project._id, name: 'Checkout conversion', description: 'Sign-up to first payment', windowHours: 168, steps: ['user_signed_up', 'product_viewed', 'checkout_started', 'payment_completed'].map((event) => ({ event })) });
await disconnectDb();
await closeRedis();

console.log('Generating traffic through the ingestion API…');
execFileSync(process.execPath, [path.join(here, '../../examples/demo-store/simulate.js'), '--users', '400', '--days', '60', '--host', config.publicApiUrl], { stdio: 'inherit', env: { ...process.env, FEATURETRACK_API_KEY: raw } });
console.log(`\nDemo ready. Sign in at ${config.webOrigin[0]} with ${DEMO.email} / ${DEMO.password}`);
console.log('Select the Production environment in the top bar.');
