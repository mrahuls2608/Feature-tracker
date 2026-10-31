import { z } from 'zod';
import mongoose from 'mongoose';
import { validationError } from './errors.js';

export function formatZod(err) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw validationError(formatZod(r.error));
  return r.data;
}

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
// Property / trait keys that are safe to use in Mongo paths.
export const SAFE_KEY = /^[A-Za-z0-9_\-$][A-Za-z0-9_\- ]{0,63}$/;
export const safeKey = z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/, 'Keys may contain letters, numbers, "_" and "-" only');
export const eventName = z.string().trim().min(1).max(128).regex(/^[$A-Za-z0-9_\-.: ]+$/, 'Event names may contain letters, numbers, spaces and _ - . : $');
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
