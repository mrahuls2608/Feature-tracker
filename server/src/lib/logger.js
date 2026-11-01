import pino from 'pino';
import { config } from '../config.js';

// Structured JSON logging. Secrets are redacted defensively wherever they might appear.
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.secret',
      '*.apiKey',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  ...(config.isProd || config.isTest ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }),
});
