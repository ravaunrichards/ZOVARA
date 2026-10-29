import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { requireAuth, isConfigured } from '../security.js';

function liveEnabled() {
  return isConfigured(config.LIVEKIT_URL) && isConfigured(config.LIVEKIT_API_KEY) && isConfigured(config.LIVEKIT_API_SECRET);
}
function rooms() {
  return new RoomServiceClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
}
async function issueToken(room: string, user: { id: string; username: string }, host: boolean) {
  const access = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { identity: user.id, name: user.username, ttl: '4h' });
  access.addGrant({ roomJoin: true, room, canPublish: host, canSubscribe: true, canPublishData: true });
  return access.toJwt();
}
function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function liveRoutes(app: FastifyInstance) {
  app.get('/api/live', async () => {
    const result = await query(`SELECT l.id,l.title,l.room_name,l.started_at,l.viewer_count,u.username,u.display_name,
      (SELECT avatar_url FROM profiles WHERE user_id=u.id) avatar_url
      FROM livestreams l JOIN users u ON u.id=l.host_id
      WHERE l.status='live' AND u.disabled_at IS NULL ORDER BY l.started_at DESC LIMIT 100`);
    return { streams: result.rows, available: liveEnabled() };
  });

  app.post('/api/live/start', { preHandler: requireAuth }, async (request, reply) => {
    if (!liveEnabled()) throw new HttpError(503, 'Livestreaming is unavailable until the owner configures LiveKit credentials.', 'LIVE_NOT_CONFIGURED');
    const parsed = z.object({ title: z.string().trim().min(3).max(150) }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'Stream title must be 3–150 characters.', 'VALIDATION_ERROR');

    const roomName = `zovara-${randomUUID()}`;
    const service = rooms();
    await service.createRoom({ name: roomName, emptyTimeout: 600, maxParticipants: 500 });
    try {
      const hostToken = await issueToken(roomName, request.user, true);
      const stream = await withTransaction(async (client) => {
        const active = await client.query("SELECT id FROM livestreams WHERE host_id=$1 AND status='live' FOR UPDATE", [request.user.id]);
        if (active.rows[0]) throw new HttpError(409, 'You already have an active livestream. End it before starting another.', 'ALREADY_LIVE');
        const inserted = await client.query("INSERT INTO livestreams(host_id,title,room_name,status,started_at) VALUES($1,$2,$3,'live',now()) RETURNING id,title,room_name,status,started_at", [request.user.id, parsed.data.title, roomName]);
        await client.query('INSERT INTO livestream_participants(stream_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [inserted.rows[0]!.id, request.user.id]);
        return inserted.rows[0];
      });
      return reply.code(201).send({ stream, serverUrl: config.LIVEKIT_URL, token: hostToken, role: 'host' });
    } catch (error) {
      await service.deleteRoom(roomName).catch(() => undefined);
      if (isUniqueViolation(error)) throw new HttpError(409, 'You already have an active livestream. End it before starting another.', 'ALREADY_LIVE');
      throw error;
    }
  });

  app.post('/api/live/:id/join', { preHandler: requireAuth }, async (request) => {
    if (!liveEnabled()) throw new HttpError(503, 'Livestreaming is unavailable until the owner configures LiveKit credentials.', 'LIVE_NOT_CONFIGURED');
    const { id } = request.params as { id: string };
    const joined = await withTransaction(async (client) => {
      const found = await client.query("SELECT id,host_id,room_name,title,status FROM livestreams WHERE id=$1 FOR UPDATE", [id]);
      const stream = found.rows[0];
      if (!stream || stream.status !== 'live') throw new HttpError(404, 'Livestream is not available.', 'NOT_LIVE');
      const host = String(stream.host_id) === request.user.id;
      const presence = await client.query(`INSERT INTO livestream_participants(stream_id,user_id,joined_at,left_at)
        VALUES($1,$2,now(),NULL)
        ON CONFLICT(stream_id,user_id) DO UPDATE SET joined_at=now(),left_at=NULL
        WHERE livestream_participants.left_at IS NOT NULL RETURNING user_id`, [id, request.user.id]);
      if (!host && presence.rowCount) {
        await client.query("UPDATE livestreams SET viewer_count=viewer_count+1 WHERE id=$1 AND status='live'", [id]);
      }
      return { stream, host };
    });
    return {
      stream: { id: joined.stream.id, title: joined.stream.title },
      serverUrl: config.LIVEKIT_URL,
      token: await issueToken(String(joined.stream.room_name), request.user, joined.host),
      role: joined.host ? 'host' : 'viewer'
    };
  });

  app.post('/api/live/:id/leave', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return withTransaction(async (client) => {
      const found = await client.query('SELECT host_id,status FROM livestreams WHERE id=$1 FOR UPDATE', [id]);
      const stream = found.rows[0];
      if (!stream || stream.status !== 'live') return { left: true, wasActive: false };
      if (String(stream.host_id) === request.user.id) throw new HttpError(400, 'The host must end the livestream rather than leave it.', 'HOST_MUST_END');
      const left = await client.query("UPDATE livestream_participants SET left_at=now() WHERE stream_id=$1 AND user_id=$2 AND left_at IS NULL RETURNING user_id", [id, request.user.id]);
      if (left.rowCount) await client.query("UPDATE livestreams SET viewer_count=GREATEST(viewer_count-1,0) WHERE id=$1 AND status='live'", [id]);
      return { left: true, wasActive: Boolean(left.rowCount) };
    });
  });

  app.post('/api/live/:id/end', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const ended = await withTransaction(async (client) => {
      const found = await client.query("SELECT id,host_id,room_name,status FROM livestreams WHERE id=$1 FOR UPDATE", [id]);
      const stream = found.rows[0];
      if (!stream || stream.status !== 'live') throw new HttpError(404, 'Livestream is not active.', 'NOT_LIVE');
      if (String(stream.host_id) !== request.user.id && !['admin', 'moderator'].includes(request.user.role)) {
        throw new HttpError(403, 'Only the host or a moderator may end this livestream.', 'FORBIDDEN');
      }
      await client.query("UPDATE livestreams SET status='ended',ended_at=now(),viewer_count=0 WHERE id=$1", [id]);
      await client.query('UPDATE livestream_participants SET left_at=COALESCE(left_at,now()) WHERE stream_id=$1', [id]);
      await client.query("INSERT INTO notifications(user_id,actor_id,kind,entity_type,entity_id) SELECT f.follower_id,$1,'live_ended','livestream',$2 FROM follows f WHERE f.following_id=$1", [stream.host_id, id]);
      return { roomName: String(stream.room_name) };
    });
    let mediaCleanupPending = false;
    if (liveEnabled()) {
      try { await rooms().deleteRoom(ended.roomName); }
      catch (error) { mediaCleanupPending = true; request.log.error({ err: error, streamId: id }, 'LiveKit room cleanup failed after the database stream ended'); }
    }
    return { ended: true, mediaCleanupPending };
  });
}
