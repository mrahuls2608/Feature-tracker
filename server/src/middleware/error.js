import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../lib/errors.js';
import { formatZod } from '../lib/validate.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(422).json({ error: { code: 'validation_error', message: 'Request validation failed', details: formatZod(err) } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body too large' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Validation failed', details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })) },
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'conflict', message: 'A resource with these values already exists', details: err.keyValue } });
  }
  (req.log || logger).error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } });
}
