import mongoose from 'mongoose';
import { Membership, Organization, Project, Environment, ROLES } from '../models/index.js';
import { forbidden, notFound } from '../lib/errors.js';

export const roleRank = (role) => ROLES.indexOf(role);
export const atLeast = (role, min) => roleRank(role) >= roleRank(min);

// Resolves the effective role a user has within a project.
export function projectRole(project, orgRole, userId) {
  if (atLeast(orgRole, 'admin')) return orgRole;
  const entry = project.members?.find((m) => String(m.user) === String(userId));
  if (project.access === 'restricted') return entry ? entry.role : null;
  if (!entry) return orgRole;
  // A project-level assignment can grant more (or less) than the org role.
  return entry.role;
}

// Loads :orgId and the caller's membership. Returns 404 for non-members so org existence is not leaked.
export function loadOrg(minRole = 'viewer') {
  return async (req, _res, next) => {
    try {
      const { orgId } = req.params;
      if (!mongoose.isValidObjectId(orgId)) throw notFound('Organization');
      const membership = await Membership.findOne({ org: orgId, user: req.user._id }).lean();
      if (!membership) throw notFound('Organization');
      const org = await Organization.findById(orgId);
      if (!org) throw notFound('Organization');
      if (!atLeast(membership.role, minRole)) throw forbidden(`Requires ${minRole} role or higher`);
      req.org = org;
      req.orgRole = membership.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Loads :projectId (+ its org), enforcing org membership and project-level access.
export function loadProject(minRole = 'viewer', { allowArchived = true } = {}) {
  return async (req, _res, next) => {
    try {
      const { projectId } = req.params;
      if (!mongoose.isValidObjectId(projectId)) throw notFound('Project');
      const project = await Project.findById(projectId);
      if (!project) throw notFound('Project');
      const membership = await Membership.findOne({ org: project.org, user: req.user._id }).lean();
      if (!membership) throw notFound('Project');
      const role = projectRole(project, membership.role, req.user._id);
      if (!role) throw notFound('Project');
      if (!atLeast(role, minRole)) throw forbidden(`Requires ${minRole} role or higher on this project`);
      if (!allowArchived && project.archivedAt && req.method !== 'GET') throw forbidden('Project is archived');
      req.project = project;
      req.org = await Organization.findById(project.org);
      req.orgRole = membership.role;
      req.projectRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Resolves the environment for a request (from :envId, ?envId or body.envId) and checks it belongs to req.project.
export async function resolveEnv(req, { required = true } = {}) {
  const envId = req.params.envId || req.query.envId || req.body?.envId;
  if (!envId) {
    if (required) throw notFound('Environment');
    return null;
  }
  if (!mongoose.isValidObjectId(envId)) throw notFound('Environment');
  const env = await Environment.findOne({ _id: envId, project: req.project._id });
  if (!env) throw notFound('Environment');
  return env;
}

export const withEnv = (opts) => async (req, _res, next) => {
  try {
    req.env = await resolveEnv(req, opts);
    next();
  } catch (err) {
    next(err);
  }
};

export function requireProjectRole(minRole) {
  return (req, _res, next) => (atLeast(req.projectRole, minRole) ? next() : next(forbidden(`Requires ${minRole} role or higher on this project`)));
}
