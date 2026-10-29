import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import rawBody from 'fastify-raw-body';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './errors.js';
import { registerRoutes } from './routes/index.js';

export async function buildServer() {
  const app = Fastify({ logger: true, trustProxy: config.NODE_ENV === 'production', bodyLimit: 1_048_576 });
  await app.register(cors, { origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true });
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: config.JWT_EXPIRES_IN } });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 } });
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true, routes: ['/api/payments/stripe/webhook'] });
  const uploadDir = resolve(config.UPLOAD_DIR);
  await mkdir(uploadDir, { recursive: true });
  await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/', decorateReply: false, setHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); } });

  app.get('/api/health', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ok', database: 'connected', service: 'zovara-api' }; }
    catch { return reply.code(503).send({ status: 'degraded', database: 'unavailable', service: 'zovara-api' }); }
  });
  await registerRoutes(app);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    if ((error as { validation?: unknown }).validation) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'The request did not match the required format.' } });
    request.log.error({ err: error }, 'Unhandled request error');
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 413) return reply.code(413).send({ error: { code: 'UPLOAD_TOO_LARGE', message: 'The uploaded file exceeds the configured size limit.' } });
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const close = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', close); process.on('SIGINT', close);
  try { await app.listen({ host: config.HOST, port: config.PORT }); }
  catch (error) { app.log.error(error); process.exit(1); }
}
