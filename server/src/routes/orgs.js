import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Organization, Membership, Invitation, User, Project, Environment, AuditLog, ApiKey, Event, Profile, EventDefinition, Feature, Funnel, Webhook, WebhookDelivery, ApiUsage } from '../models/index.js';
import { ah, forbidden, notFound, conflict, badRequest } from '../lib/errors.js';
import { parse, pagination } from '../lib/validate.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { loadOrg, atLeast } from '../middleware/rbac.js';
import { audit } from '../lib/audit.js';
import { notifyUsers, sendEmail } from '../lib/notify.js';
import { config } from '../config.js';
import { createProjectWithEnvironments, serializeProject } from './projects.js';

const r = Router();

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
async function uniqueSlug(name) {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}` : base;
    if (!(await Organization.exists({ slug }))) return slug;
  }
  return `${base}-${Date.now()}`;
}

const orgSchema = z.object({
  name: z.string().trim().min(2).max(80),
  website: z.string().trim().url().max(200).optional().or(z.literal('')),
  settings: z.object({ retentionDays: z.number().int().min(7).max(1825), defaultRole: z.enum(['viewer', 'developer']) }).partial().optional(),
});

r.get('/', ah(async (req, res) => {
  const memberships = await Membership.find({ user: req.user._id }).populate('org').lean();
  res.json({ items: memberships.filter((m) => m.org).map((m) => ({ ...serializeOrg(m.org), role: m.role })) });
}));

r.post('/', ah(async (req, res) => {
  const body = parse(orgSchema.extend({ createSampleProject: z.boolean().optional() }), req.body);
  const org = await Organization.create({ name: body.name, website: body.website, slug: await uniqueSlug(body.name), createdBy: req.user._id });
  await Membership.create({ org: org._id, user: req.user._id, role: 'owner' });
  req.org = org;
  await audit(req, { action: 'organization.created', target: { type: 'organization', id: String(org._id), name: org.name } });
  res.status(201).json({ ...serializeOrg(org), role: 'owner' });
}));

r.get('/:orgId', loadOrg(), ah(async (req, res) => {
  const [members, projects] = await Promise.all([Membership.countDocuments({ org: req.org._id }), Project.countDocuments({ org: req.org._id, archivedAt: null })]);
  res.json({ ...serializeOrg(req.org), role: req.orgRole, stats: { members, projects } });
}));

r.patch('/:orgId', loadOrg('admin'), ah(async (req, res) => {
  const body = parse(orgSchema.partial(), req.body);
  const before = { name: req.org.name, website: req.org.website, settings: { ...req.org.settings?.toObject?.() } };
  if (body.name) req.org.name = body.name;
  if (body.website !== undefined) req.org.website = body.website;
  if (body.settings) {
    if (body.settings.retentionDays !== undefined) req.org.settings.retentionDays = body.settings.retentionDays;
    if (body.settings.defaultRole) req.org.settings.defaultRole = body.settings.defaultRole;
  }
  await req.org.save();
  await audit(req, { action: 'organization.updated', project: null, target: { type: 'organization', id: String(req.org._id), name: req.org.name }, metadata: { before, changes: body } });
  res.json({ ...serializeOrg(req.org), role: req.orgRole });
}));

// Deleting an organization removes every project and all tracked data. Owner only, requires name confirmation.
r.delete('/:orgId', loadOrg('owner'), ah(async (req, res) => {
  const { confirm } = parse(z.object({ confirm: z.string() }), req.body || {});
  if (confirm !== req.org.name) throw badRequest('Type the organization name to confirm deletion');
  const orgId = req.org._id;
  const projects = await Project.find({ org: orgId }).select('_id').lean();
  const pids = projects.map((p) => p._id);
  const hooks = await Webhook.find({ project: { $in: pids } }).select('_id').lean();
  const envs = await Environment.find({ project: { $in: pids } }).select('_id').lean();
  await Promise.all([
    Event.deleteMany({ org: orgId }),
    Profile.deleteMany({ org: orgId }),
    EventDefinition.deleteMany({ org: orgId }),
    Feature.deleteMany({ org: orgId }),
    Funnel.deleteMany({ org: orgId }),
    WebhookDelivery.deleteMany({ webhook: { $in: hooks.map((h) => h._id) } }),
    Webhook.deleteMany({ org: orgId }),
    ApiKey.deleteMany({ org: orgId }),
    ApiUsage.deleteMany({ environment: { $in: envs.map((e) => e._id) } }),
    Environment.deleteMany({ org: orgId }),
    Project.deleteMany({ org: orgId }),
    Invitation.deleteMany({ org: orgId }),
    Membership.deleteMany({ org: orgId }),
    AuditLog.deleteMany({ org: orgId }),
  ]);
  await Organization.deleteOne({ _id: orgId });
  res.json({ ok: true });
}));

// ── Members ────────────────────────────────────────────────────────────────
r.get('/:orgId/members', loadOrg(), ah(async (req, res) => {
  const members = await Membership.find({ org: req.org._id }).populate('user').sort({ createdAt: 1 }).lean();
  res.json({
    items: members.filter((m) => m.user).map((m) => ({ id: String(m._id), role: m.role, joinedAt: m.createdAt, user: { id: String(m.user._id), name: m.user.name, email: m.user.email, lastLoginAt: m.user.lastLoginAt } })),
  });
}));

r.patch('/:orgId/members/:memberId', loadOrg('admin'), ah(async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(['viewer', 'developer', 'admin', 'owner']) }), req.body);
  const m = await Membership.findOne({ _id: req.params.memberId, org: req.org._id }).populate('user');
  if (!m) throw notFound('Member');
  if ((m.role === 'owner' || role === 'owner') && req.orgRole !== 'owner') throw forbidden('Only owners can grant or change the owner role');
  if (m.role === 'owner' && role !== 'owner' && (await Membership.countDocuments({ org: req.org._id, role: 'owner' })) <= 1) throw badRequest('An organization must have at least one owner');
  const previous = m.role;
  m.role = role;
  await m.save();
  await audit(req, { action: 'member.role_changed', project: null, target: { type: 'user', id: String(m.user._id), name: m.user.email }, metadata: { from: previous, to: role } });
  await notifyUsers([m.user._id], 'memberChanges', { org: req.org._id, type: 'member.role_changed', title: 'Your role changed', body: `Your role in ${req.org.name} is now ${role}.`, link: '/team' });
  res.json({ id: String(m._id), role: m.role });
}));

r.delete('/:orgId/members/:memberId', loadOrg('viewer'), ah(async (req, res) => {
  const m = await Membership.findOne({ _id: req.params.memberId, org: req.org._id }).populate('user');
  if (!m) throw notFound('Member');
  const self = String(m.user._id) === String(req.user._id);
  if (!self && !atLeast(req.orgRole, 'admin')) throw forbidden();
  if (m.role === 'owner' && !self && req.orgRole !== 'owner') throw forbidden('Only owners can remove owners');
  if (m.role === 'owner' && (await Membership.countDocuments({ org: req.org._id, role: 'owner' })) <= 1) throw badRequest('Transfer ownership before removing the last owner');
  await m.deleteOne();
  await Project.updateMany({ org: req.org._id }, { $pull: { members: { user: m.user._id } } });
  await audit(req, { action: self ? 'member.left' : 'member.removed', project: null, target: { type: 'user', id: String(m.user._id), name: m.user.email }, metadata: { role: m.role } });
  res.json({ ok: true });
}));

// ── Invitations ────────────────────────────────────────────────────────────
r.get('/:orgId/invitations', loadOrg('admin'), ah(async (req, res) => {
  await Invitation.updateMany({ org: req.org._id, status: 'pending', expiresAt: { $lt: new Date() } }, { status: 'expired' });
  const items = await Invitation.find({ org: req.org._id }).populate('invitedBy', 'name email').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items: items.map(({ tokenHash, ...i }) => ({ ...i, id: String(i._id) })) });
}));

r.post('/:orgId/invitations', loadOrg('admin'), ah(async (req, res) => {
  const body = parse(z.object({ email: z.string().trim().email().max(200), role: z.enum(['viewer', 'developer', 'admin']) }), req.body);
  const email = body.email.toLowerCase();
  const existingUser = await User.findOne({ email });
  if (existingUser && (await Membership.exists({ org: req.org._id, user: existingUser._id }))) throw conflict('This person is already a member');
  if (body.role === 'admin' && !atLeast(req.orgRole, 'admin')) throw forbidden();
  await Invitation.updateMany({ org: req.org._id, email, status: 'pending' }, { status: 'revoked' });
  const token = randomToken(32);
  const inv = await Invitation.create({ org: req.org._id, email, role: body.role, tokenHash: sha256(token), invitedBy: req.user._id, expiresAt: new Date(Date.now() + 7 * 86400_000) });
  const link = `${config.webOrigin[0]}/invite/${token}`;
  await sendEmail({ to: email, subject: `You're invited to join ${req.org.name} on FeatureTrack`, text: `${req.user.name} invited you to ${req.org.name}. Accept: ${link}` });
  if (existingUser) await notifyUsers([existingUser._id], 'invitations', { org: req.org._id, type: 'invitation', title: `Invitation to ${req.org.name}`, body: `${req.user.name} invited you as ${body.role}.`, link: '/invitations' });
  await audit(req, { action: 'member.invited', project: null, target: { type: 'invitation', id: String(inv._id), name: email }, metadata: { role: body.role } });
  // The invite link is returned once so admins can share it directly.
  res.status(201).json({ id: String(inv._id), email, role: inv.role, status: inv.status, expiresAt: inv.expiresAt, inviteUrl: link });
}));

r.delete('/:orgId/invitations/:invId', loadOrg('admin'), ah(async (req, res) => {
  const inv = await Invitation.findOneAndUpdate({ _id: req.params.invId, org: req.org._id, status: 'pending' }, { status: 'revoked' }, { new: true });
  if (!inv) throw notFound('Pending invitation');
  await audit(req, { action: 'invitation.revoked', project: null, target: { type: 'invitation', id: String(inv._id), name: inv.email } });
  res.json({ ok: true });
}));

// ── Projects under org ─────────────────────────────────────────────────────
r.get('/:orgId/projects', loadOrg(), ah(async (req, res) => {
  const { archived } = req.query;
  const filter = { org: req.org._id };
  if (archived === 'true') filter.archivedAt = { $ne: null };
  else if (archived !== 'all') filter.archivedAt = null;
  const projects = await Project.find(filter).sort({ createdAt: 1 }).lean();
  const visible = projects.filter((p) => atLeast(req.orgRole, 'admin') || p.access !== 'restricted' || p.members?.some((m) => String(m.user) === String(req.user._id)));
  const envs = await Environment.find({ project: { $in: visible.map((p) => p._id) } }).lean();
  res.json({ items: visible.map((p) => serializeProject(p, envs.filter((e) => String(e.project) === String(p._id)), req.orgRole, req.user._id)) });
}));

r.post('/:orgId/projects', loadOrg('admin'), ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(500).optional(), access: z.enum(['organization', 'restricted']).optional() }), req.body);
  const { project, environments } = await createProjectWithEnvironments(req.org, req.user, body);
  req.project = project;
  await audit(req, { action: 'project.created', target: { type: 'project', id: String(project._id), name: project.name } });
  res.status(201).json(serializeProject(project.toObject(), environments.map((e) => e.toObject()), req.orgRole, req.user._id));
}));

// ── Audit log ──────────────────────────────────────────────────────────────
r.get('/:orgId/audit-logs', loadOrg('admin'), ah(async (req, res) => {
  const q = parse(pagination.extend({ action: z.string().max(60).optional(), projectId: z.string().optional(), actor: z.string().max(200).optional(), q: z.string().max(100).optional() }), req.query);
  const filter = { org: req.org._id };
  if (q.action) filter.action = { $regex: `^${q.action.replace(/[^a-z_.]/gi, '')}` };
  if (q.projectId && mongoose.isValidObjectId(q.projectId)) filter.project = q.projectId;
  if (q.actor) filter['actor.email'] = q.actor.toLowerCase();
  if (q.q) {
    const re = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = [{ action: re }, { 'target.name': re }, { 'actor.email': re }];
  }
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), AuditLog.countDocuments(filter)]);
  res.json({ items: items.map((i) => ({ ...i, id: String(i._id) })), total, page: q.page, limit: q.limit });
}));

export function serializeOrg(org) {
  const o = org.toObject ? org.toObject() : org;
  return { id: String(o._id), name: o.name, slug: o.slug, website: o.website || '', settings: o.settings, createdAt: o.createdAt };
}

export default r;
