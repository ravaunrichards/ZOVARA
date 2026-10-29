import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../security.js';

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().trim().regex(/^[a-zA-Z0-9_.]{3,30}$/),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(128)
});
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
function presentUser(row: Record<string, unknown>) {
  return { id: row.id, email: row.email, username: row.username, displayName: row.display_name, role: row.role, createdAt: row.created_at };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid registration details.', 'VALIDATION_ERROR');
    const data = { ...parsed.data, email: parsed.data.email.toLowerCase(), username: parsed.data.username.toLowerCase() };
    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await withTransaction(async (client) => {
      const inserted = await client.query(
        'INSERT INTO users(email, username, password_hash, display_name) VALUES($1,$2,$3,$4) RETURNING id,email,username,display_name,role,created_at',
        [data.email, data.username, passwordHash, data.displayName]
      );
      const user = inserted.rows[0]!;
      await client.query('INSERT INTO profiles(user_id) VALUES($1)', [user.id]);
      await client.query('INSERT INTO wallets(user_id) VALUES($1)', [user.id]);
      return user;
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new HttpError(409, 'That email or username is already in use.', 'ACCOUNT_EXISTS');
      throw error;
    });
    const safe = presentUser(created as unknown as Record<string, unknown>);
    const token = await reply.jwtSign({ id: String(created.id), username: String(created.username), email: String(created.email), role: created.role });
    return reply.code(201).send({ user: safe, token });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'Enter a valid email and password.', 'VALIDATION_ERROR');
    const result = await query('SELECT id,email,username,display_name,role,created_at,password_hash,disabled_at FROM users WHERE email=$1', [parsed.data.email.toLowerCase()]);
    const user = result.rows[0] as Record<string, unknown> | undefined;
    if (!user || !(await bcrypt.compare(parsed.data.password, String(user.password_hash)))) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
    if (user.disabled_at) throw new HttpError(403, 'This account is currently unavailable. Contact support.', 'ACCOUNT_DISABLED');
    const safe = presentUser(user);
    const token = await reply.jwtSign({ id: String(user.id), username: String(user.username), email: String(user.email), role: user.role });
    return { user: safe, token };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const result = await query(
      `SELECT u.id,u.email,u.username,u.display_name,u.role,u.created_at,
       p.mode,p.bio,p.pronouns,p.avatar_url,p.banner_url,p.theme,p.links,p.featured_post_ids,p.livestream_schedule,p.achievements
       FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.disabled_at IS NULL`, [request.user.id]
    );
    if (!result.rows[0]) throw new HttpError(404, 'Account not found.', 'NOT_FOUND');
    const r = result.rows[0];
    return { user: { id:r.id,email:r.email,username:r.username,displayName:r.display_name,role:r.role,createdAt:r.created_at }, profile: { mode:r.mode,bio:r.bio,pronouns:r.pronouns,avatarUrl:r.avatar_url,bannerUrl:r.banner_url,theme:r.theme,links:r.links,featuredPostIds:r.featured_post_ids,livestreamSchedule:r.livestream_schedule,achievements:r.achievements } };
  });
}
