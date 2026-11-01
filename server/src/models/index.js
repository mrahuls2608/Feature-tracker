import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const toJSON = {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};
const opts = { timestamps: true, toJSON };

export const ROLES = ['viewer', 'developer', 'admin', 'owner'];
export const ENV_TYPES = ['development', 'staging', 'production'];

// ── Accounts ────────────────────────────────────────────────────────────────
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: Date,
    lastLoginAt: Date,
    preferences: {
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
      notifications: {
        invitations: { type: Boolean, default: true },
        memberChanges: { type: Boolean, default: true },
        webhookFailures: { type: Boolean, default: true },
        apiKeyChanges: { type: Boolean, default: true },
      },
    },
  },
  opts,
);
userSchema.set('toJSON', { ...toJSON, transform(d, r) { toJSON.transform(d, r); delete r.passwordHash; return r; } });
export const User = model('User', userSchema);

const sessionSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    userAgent: String,
    ip: String,
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  opts,
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = model('Session', sessionSchema);

// ── Organizations ───────────────────────────────────────────────────────────
const orgSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    website: String,
    createdBy: { type: ObjectId, ref: 'User' },
    settings: {
      retentionDays: { type: Number, default: 365, min: 7, max: 1825 },
      defaultRole: { type: String, enum: ['viewer', 'developer'], default: 'viewer' },
    },
  },
  opts,
);
export const Organization = model('Organization', orgSchema);

const membershipSchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true },
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
  },
  opts,
);
membershipSchema.index({ org: 1, user: 1 }, { unique: true });
export const Membership = model('Membership', membershipSchema);

const invitationSchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['viewer', 'developer', 'admin'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'revoked', 'expired'], default: 'pending' },
    invitedBy: { type: ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
  },
  opts,
);
invitationSchema.index({ email: 1, status: 1 });
export const Invitation = model('Invitation', invitationSchema);

// ── Projects & environments ─────────────────────────────────────────────────
const projectSchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    archivedAt: Date,
    // "organization": every org member can access using their org role.
    // "restricted": only owners/admins and listed members can access.
    access: { type: String, enum: ['organization', 'restricted'], default: 'organization' },
    members: [{ _id: false, user: { type: ObjectId, ref: 'User' }, role: { type: String, enum: ['viewer', 'developer', 'admin'] } }],
    settings: {
      strictEvents: { type: Boolean, default: false }, // reject events that are not defined
      timezone: { type: String, default: 'UTC' },
    },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  opts,
);
export const Project = model('Project', projectSchema);

const environmentSchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    type: { type: String, enum: ENV_TYPES, required: true },
    name: { type: String, required: true },
    color: { type: String, default: '#6366f1' },
    settings: {
      ingestionEnabled: { type: Boolean, default: true },
      allowedOrigins: { type: [String], default: [] },
    },
  },
  opts,
);
environmentSchema.index({ project: 1, type: 1 }, { unique: true });
export const Environment = model('Environment', environmentSchema);

const apiKeySchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    environment: { type: ObjectId, ref: 'Environment', required: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true },
    last4: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true, select: false },
    scopes: { type: [String], default: ['ingest', 'flags'] },
    createdBy: { type: ObjectId, ref: 'User' },
    lastUsedAt: Date,
    lastUsedIp: String,
    revokedAt: Date,
    revokedBy: { type: ObjectId, ref: 'User' },
    rotatedFrom: { type: ObjectId, ref: 'ApiKey' },
  },
  opts,
);
export const ApiKey = model('ApiKey', apiKeySchema);

// ── Event schema & data ─────────────────────────────────────────────────────
const eventDefinitionSchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true },
    project: { type: ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true },
    displayName: String,
    description: { type: String, default: '' },
    category: { type: String, default: 'general' },
    status: { type: String, enum: ['active', 'discovered', 'deprecated'], default: 'active' },
    properties: [
      {
        _id: false,
        name: { type: String, required: true },
        type: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array', 'any'], default: 'any' },
        required: { type: Boolean, default: false },
        description: String,
      },
    ],
    firstSeenAt: Date,
    lastSeenAt: Date,
    createdBy: { type: ObjectId, ref: 'User' },
  },
  opts,
);
eventDefinitionSchema.index({ project: 1, name: 1 }, { unique: true });
export const EventDefinition = model('EventDefinition', eventDefinitionSchema);

const eventSchema = new Schema(
  {
    org: { type: ObjectId, required: true },
    project: { type: ObjectId, required: true },
    environment: { type: ObjectId, required: true },
    name: { type: String, required: true },
    distinctId: { type: String, required: true },
    properties: { type: Schema.Types.Mixed, default: {} },
    context: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
    messageId: { type: String, required: true },
    apiKey: { type: ObjectId },
  },
  { toJSON, minimize: false },
);
eventSchema.index({ environment: 1, timestamp: -1 });
eventSchema.index({ environment: 1, name: 1, timestamp: -1 });
eventSchema.index({ environment: 1, distinctId: 1, timestamp: -1 });
eventSchema.index({ environment: 1, 'properties.feature': 1, name: 1, timestamp: -1 }, { sparse: true });
eventSchema.index({ environment: 1, messageId: 1 }, { unique: true });
eventSchema.index({ org: 1, timestamp: 1 });
export const Event = model('Event', eventSchema);

const profileSchema = new Schema(
  {
    org: { type: ObjectId, required: true },
    project: { type: ObjectId, required: true },
    environment: { type: ObjectId, required: true },
    distinctId: { type: String, required: true },
    traits: { type: Schema.Types.Mixed, default: {} },
    firstSeenAt: Date,
    lastSeenAt: Date,
    eventCount: { type: Number, default: 0 },
    lastEvent: String,
  },
  { ...opts, minimize: false },
);
profileSchema.index({ environment: 1, distinctId: 1 }, { unique: true });
profileSchema.index({ environment: 1, lastSeenAt: -1 });
export const Profile = model('Profile', profileSchema);

const apiUsageSchema = new Schema({
  environment: { type: ObjectId, required: true },
  project: { type: ObjectId, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD (UTC)
  requests: { type: Number, default: 0 },
  events: { type: Number, default: 0 },
  rejected: { type: Number, default: 0 },
});
apiUsageSchema.index({ environment: 1, date: 1 }, { unique: true });
export const ApiUsage = model('ApiUsage', apiUsageSchema);

// ── Features ────────────────────────────────────────────────────────────────
const ruleSchema = new Schema(
  {
    property: { type: String, required: true },
    operator: { type: String, enum: ['eq', 'neq', 'in', 'contains', 'gt', 'lt'], required: true },
    value: Schema.Types.Mixed,
  },
  { _id: false },
);
const featureSchema = new Schema(
  {
    org: { type: ObjectId, ref: 'Organization', required: true },
    project: { type: ObjectId, ref: 'Project', required: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['planned', 'beta', 'live', 'deprecated'], default: 'planned' },
    owner: String,
    tags: [String],
    // Events (besides $feature_exposed with properties.feature = key) that count as exposure / adoption.
    exposureEvents: [String],
    adoptionEvents: [String],
    conversionEvent: String,
    // Per-environment rollout configuration evaluated by /v1/flags.
    rollouts: [
      {
        _id: false,
        environment: { type: ObjectId, ref: 'Environment', required: true },
        enabled: { type: Boolean, default: false },
        percentage: { type: Number, min: 0, max: 100, default: 100 },
        rules: [ruleSchema],
      },
    ],
    createdBy: { type: ObjectId, ref: 'User' },
  },
  opts,
);
featureSchema.index({ project: 1, key: 1 }, { unique: true });
export const Feature = model('Feature', featureSchema);

const funnelSchema = new Schema(
  {
    org: { type: ObjectId, required: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true },
    description: String,
    steps: [
      {
        _id: false,
        event: { type: String, required: true },
        label: String,
        filters: [{ _id: false, property: String, operator: { type: String, enum: ['eq', 'neq', 'contains', 'gt', 'lt'] }, value: Schema.Types.Mixed }],
      },
    ],
    windowHours: { type: Number, default: 24 * 7 },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  opts,
);
export const Funnel = model('Funnel', funnelSchema);

// ── Webhooks ────────────────────────────────────────────────────────────────
const webhookSchema = new Schema(
  {
    org: { type: ObjectId, required: true },
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    environment: { type: ObjectId, ref: 'Environment' }, // null = all environments
    url: { type: String, required: true },
    description: String,
    events: { type: [String], default: ['*'] },
    enabled: { type: Boolean, default: true },
    secretEncrypted: { type: String, required: true, select: false },
    secretLast4: String,
    createdBy: { type: ObjectId, ref: 'User' },
    lastDeliveryAt: Date,
    lastDeliveryStatus: String,
  },
  opts,
);
export const Webhook = model('Webhook', webhookSchema);

const deliverySchema = new Schema(
  {
    webhook: { type: ObjectId, ref: 'Webhook', required: true },
    project: { type: ObjectId, required: true },
    eventType: String,
    eventName: String,
    eventId: String,
    payload: Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'retrying', 'succeeded', 'failed'], default: 'pending' },
    attempts: [
      {
        _id: false,
        at: Date,
        requestHeaders: Schema.Types.Mixed,
        responseStatus: Number,
        responseBody: String,
        durationMs: Number,
        error: String,
      },
    ],
    attemptCount: { type: Number, default: 0 },
    nextAttemptAt: Date,
    completedAt: Date,
  },
  opts,
);
deliverySchema.index({ webhook: 1, createdAt: -1 });
export const WebhookDelivery = model('WebhookDelivery', deliverySchema);

// ── Audit & notifications ───────────────────────────────────────────────────
const auditSchema = new Schema(
  {
    org: { type: ObjectId, required: true },
    project: { type: ObjectId },
    actor: { id: ObjectId, email: String, name: String, type: { type: String, default: 'user' } },
    action: { type: String, required: true },
    target: { type: { type: String }, id: String, name: String },
    metadata: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON },
);
auditSchema.index({ org: 1, createdAt: -1 });
auditSchema.index({ org: 1, project: 1, createdAt: -1 });
export const AuditLog = model('AuditLog', auditSchema);

const notificationSchema = new Schema(
  {
    user: { type: ObjectId, required: true },
    org: { type: ObjectId },
    type: String,
    title: String,
    body: String,
    link: String,
    readAt: Date,
  },
  opts,
);
notificationSchema.index({ user: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);
