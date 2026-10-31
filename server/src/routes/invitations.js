import { Router } from 'express';
import { Invitation, Membership, Organization } from '../models/index.js';
import { ah, notFound, forbidden, badRequest } from '../lib/errors.js';
import { sha256 } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';

const r = Router();

async function findByToken(token) {
  const inv = await Invitation.findOne({ tokenHash: sha256(String(token)) }).populate('org', 'name slug').populate('invitedBy', 'name email');
  if (!inv) throw notFound('Invitation');
  if (inv.status === 'pending' && inv.expiresAt < new Date()) {
    inv.status = 'expired';
    await inv.save();
  }
  return inv;
}

const view = (inv) => ({ id: String(inv._id), email: inv.email, role: inv.role, status: inv.status, expiresAt: inv.expiresAt, organization: inv.org && { id: String(inv.org._id), name: inv.org.name }, invitedBy: inv.invitedBy && { name: inv.invitedBy.name } });

// Pending invitations for the logged-in user's email address.
r.get('/', ah(async (req, res) => {
  const items = await Invitation.find({ email: req.user.email, status: 'pending', expiresAt: { $gt: new Date() } }).populate('org', 'name').populate('invitedBy', 'name');
  res.json({ items: items.map(view) });
}));

r.get('/token/:token', ah(async (req, res) => res.json(view(await findByToken(req.params.token)))));

async function respond(req, inv, accept) {
  if (inv.status !== 'pending') throw badRequest(`This invitation is ${inv.status}`);
  if (inv.email !== req.user.email) throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that email to respond.`);
  inv.status = accept ? 'accepted' : 'rejected';
  inv.respondedAt = new Date();
  await inv.save();
  const org = await Organization.findById(inv.org._id || inv.org);
  req.org = org;
  if (accept) {
    await Membership.updateOne({ org: org._id, user: req.user._id }, { $setOnInsert: { role: inv.role } }, { upsert: true });
  }
  await audit(req, { action: accept ? 'invitation.accepted' : 'invitation.rejected', project: null, target: { type: 'user', id: String(req.user._id), name: req.user.email }, metadata: { role: inv.role } });
  return { ok: true, organization: { id: String(org._id), name: org.name }, status: inv.status };
}

r.post('/token/:token/accept', ah(async (req, res) => res.json(await respond(req, await findByToken(req.params.token), true))));
r.post('/token/:token/reject', ah(async (req, res) => res.json(await respond(req, await findByToken(req.params.token), false))));
r.post('/:id/accept', ah(async (req, res) => {
  const inv = await Invitation.findById(req.params.id).populate('org', 'name');
  if (!inv) throw notFound('Invitation');
  res.json(await respond(req, inv, true));
}));
r.post('/:id/reject', ah(async (req, res) => {
  const inv = await Invitation.findById(req.params.id).populate('org', 'name');
  if (!inv) throw notFound('Invitation');
  res.json(await respond(req, inv, false));
}));

export { findByToken, view };
export default r;
