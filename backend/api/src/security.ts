import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from './errors.js';
import { query } from './db.js';
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  try { await request.jwtVerify(); } catch { throw new HttpError(401, 'Sign in is required.', 'AUTH_REQUIRED'); }
  const current = await query('SELECT id, username, email, role FROM users WHERE id=$1 AND disabled_at IS NULL', [request.user.id]);
  if (!current.rows[0]) throw new HttpError(401, 'This session is no longer valid. Sign in again or contact support.', 'SESSION_REVOKED');
  Object.assign(request.user, { id: String(current.rows[0].id), username: current.rows[0].username, email: current.rows[0].email, role: current.rows[0].role });
}
export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  await requireAuth(request, _reply);
  if (request.user.role !== 'admin') throw new HttpError(403, 'Administrator access required.', 'FORBIDDEN');
}
export function registerAuthDecorators(app: FastifyInstance) { app.decorateRequest('sessionUser', null); }
export function safeUser<T extends Record<string, unknown>>(user: T) {
  const { password_hash, ...safe } = user; return safe;
}
export function isConfigured(value: string | undefined): boolean { return Boolean(value && value.trim()); }
