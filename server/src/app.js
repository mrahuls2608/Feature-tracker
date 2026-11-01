import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { requireAuth } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import orgRoutes from './routes/orgs.js';
import invitationRoutes, { findByToken, view as inviteView } from './routes/invitations.js';
import projectRoutes from './routes/projects.js';
import dataRoutes from './routes/data.js';
import productRoutes from './routes/product.js';
import webhookRoutes from './routes/webhooks.js';
import ingestRoutes from './routes/ingest.js';
import healthRoutes from './routes/health.js';
import { catalog, openapi } from './apiCatalog.js';
import { forbidden } from './lib/errors.js';


export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url.startsWith('/health') },
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }), res: (res) => ({ statusCode: res.statusCode }) },
    }),
  );

  app.use('/health', healthRoutes);

  // Public ingestion API: any origin may send events (auth is the API key), larger body limit.
  app.use('/v1', cors({ origin: true, credentials: false, maxAge: 86400 }), express.json({ limit: '1mb' }), ingestRoutes);

  // Dashboard API: credentialed CORS restricted to the web origin(s).
  app.use('/api', cors({ origin: config.webOrigin, credentials: true }), express.json({ limit: '200kb' }), cookieParser());

  // CSRF defense for cookie-authenticated requests: state-changing calls must be JSON
  // (forms cannot send application/json cross-site without a CORS preflight).
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' && req.body && Object.keys(req.body).length && !req.is('application/json')) {
      return next(forbidden('Content-Type must be application/json'));
    }
    next();
  });

  app.get('/api/docs/endpoints', (_req, res) => res.json({ items: catalog(), baseUrl: config.publicApiUrl }));
  app.get('/api/docs/openapi.json', (_req, res) => res.json(openapi(config.publicApiUrl)));

  app.use('/api/auth', authRoutes);
  // Public invitation preview so the invite page can show context before sign-in.
  app.get('/api/public/invitations/:token', rateLimit({ name: 'invite', limit: 30, key: (req) => req.ip }), async (req, res, next) => {
    try {
      res.json(inviteView(await findByToken(req.params.token)));
    } catch (err) {
      next(err);
    }
  });

  const apiLimiter = rateLimit({ name: 'api', limit: config.rateLimits.apiPerMinute, key: (req) => String(req.user?._id || req.ip) });
  app.use('/api/orgs', requireAuth, apiLimiter, orgRoutes);
  app.use('/api/invitations', requireAuth, apiLimiter, invitationRoutes);
  app.use('/api/projects', requireAuth, apiLimiter, projectRoutes, dataRoutes, productRoutes, webhookRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
