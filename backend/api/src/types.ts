import type { FastifyRequest } from 'fastify';
export type SessionUser = { id: string; username: string; email: string; role: 'user' | 'moderator' | 'admin' };
declare module '@fastify/jwt' { interface FastifyJWT { payload: SessionUser; user: SessionUser; } }
export type AuthRequest = FastifyRequest & { user: SessionUser };
