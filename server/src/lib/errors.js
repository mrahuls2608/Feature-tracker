export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'bad_request', message, details);
export const validationError = (details) => new AppError(422, 'validation_error', 'Request validation failed', details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message) => new AppError(409, 'conflict', message);
export const tooMany = (retryAfter) => new AppError(429, 'rate_limited', 'Too many requests', { retryAfter });

// Wrap async route handlers so rejections reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
