import type { FastifyReply } from 'fastify';
export class HttpError extends Error { constructor(public statusCode: number, message: string, public code = 'REQUEST_ERROR') { super(message); } }
export function fail(reply: FastifyReply, statusCode: number, message: string, code = 'REQUEST_ERROR') {
  return reply.code(statusCode).send({ error: { code, message } });
}
