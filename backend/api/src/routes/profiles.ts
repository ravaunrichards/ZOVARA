import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../security.js';

const webUrl = z.string().url().max(2048).refine((value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Only HTTP(S) links are allowed.');

const profilePatch = z.object({
  mode: z.enum(['personal','creator','business','community']).optional(),
  bio: z.string().max(300).optional(), pronouns: z.string().max(60).optional(),
  avatarUrl: webUrl.nullable().optional(), bannerUrl: webUrl.nullable().optional(),
  theme: z.object({ preset: z.string().max(40).optional(), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), layout: z.enum(['editorial','grid','showcase','immersive']).optional(), depth: z.enum(['flat','subtle','3d']).optional() }).optional(),
  links: z.array(z.object({ label: z.string().trim().min(1).max(30), url: webUrl })).max(12).optional(),
  featuredPostIds: z.array(z.string().uuid()).max(6).optional(),
  livestreamSchedule: z.array(z.object({ title: z.string().max(100), startsAt: z.string().datetime(), recurring: z.string().max(80).optional() })).max(20).optional()
}).strict();

export async function profileRoutes(app: FastifyInstance) {
 app.get('/api/profiles/me', { preHandler: requireAuth }, async (request) => {
   const r = await query(`SELECT u.id,u.username,u.display_name,u.role,p.mode,p.bio,p.pronouns,p.avatar_url,p.banner_url,p.theme,p.links,p.featured_post_ids,p.livestream_schedule,p.achievements,
   (SELECT count(*)::int FROM follows WHERE following_id=u.id) followers,
   (SELECT count(*)::int FROM follows WHERE follower_id=u.id) following
   FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.disabled_at IS NULL`, [request.user.id]);
   if (!r.rows[0]) throw new HttpError(404, 'Profile not found.', 'NOT_FOUND'); return { profile: presentProfile(r.rows[0]) };
 });
 app.patch('/api/profiles/me', { preHandler: requireAuth }, async (request) => {
   const parsed = profilePatch.safeParse(request.body);
   if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid profile fields.', 'VALIDATION_ERROR');
   const d = parsed.data; const values: unknown[] = []; const sets: string[] = [];
   const map: Record<string, [string, unknown]> = {
    mode: ['mode', d.mode], bio: ['bio', d.bio], pronouns: ['pronouns', d.pronouns], avatarUrl: ['avatar_url', d.avatarUrl], bannerUrl: ['banner_url', d.bannerUrl],
    theme: ['theme', d.theme], links: ['links', d.links], featuredPostIds: ['featured_post_ids', d.featuredPostIds], livestreamSchedule: ['livestream_schedule', d.livestreamSchedule]
   };
   for (const [key,[column,value]] of Object.entries(map)) if (value !== undefined) { values.push(JSON.stringify(['theme','links','featured_post_ids','livestream_schedule'].includes(column) ? value : value)); sets.push(`${column}=$${values.length}${['theme','links','featured_post_ids','livestream_schedule'].includes(column) ? '::jsonb' : ''}`); if (['mode','bio','pronouns','avatarUrl','bannerUrl'].includes(key) && value === null) values[values.length-1] = null; }
   if (!sets.length) throw new HttpError(400, 'No editable profile fields were supplied.', 'EMPTY_UPDATE');
   // Preserve native scalar values; JSON fields are encoded separately.
   for (let i=0;i<sets.length;i++) { const col = sets[i]!.split('=')[0]!; const key = Object.entries(map).find(([,v])=>v[0]===col)?.[0]; if (key && !['theme','links','featuredPostIds','livestreamSchedule'].includes(key)) values[i] = (d as Record<string,unknown>)[key]; }
   values.push(request.user.id);
   await query(`UPDATE profiles SET ${sets.join(',')}, updated_at=now() WHERE user_id=$${values.length}`, values);
   const fresh = await query('SELECT * FROM profiles WHERE user_id=$1', [request.user.id]); return { profile: fresh.rows[0] };
 });
 app.get('/api/profiles/:username', async (request) => {
   const { username } = request.params as { username: string };
   const r = await query(`SELECT u.id,u.username,u.display_name,u.role,u.created_at,p.mode,p.bio,p.pronouns,p.avatar_url,p.banner_url,p.theme,p.links,p.featured_post_ids,p.livestream_schedule,p.achievements,
     (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) followers,
     (SELECT count(*)::int FROM follows f WHERE f.follower_id=u.id) following,
     EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=u.id) is_following,
     (SELECT count(*)::int FROM posts po WHERE po.author_id=u.id AND po.status='published') post_count
     FROM users u JOIN profiles p ON p.user_id=u.id WHERE lower(u.username)=lower($1) AND u.disabled_at IS NULL`, [username, request.user?.id ?? null]);
   if (!r.rows[0]) throw new HttpError(404,'Profile not found.','NOT_FOUND');
   const profile = r.rows[0];
   const posts = await query(`SELECT p.id,p.caption,p.media_type,p.media_url,p.thumbnail_url,p.created_at,
     (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) likes,
     (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comments,
     EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$2) liked
     FROM posts p WHERE p.author_id=$1 AND p.status='published' AND (p.visibility='public' OR ($2=$1) OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=$1))) ORDER BY p.created_at DESC LIMIT 60`, [profile.id, request.user?.id ?? null]);
   return { profile: presentProfile(profile), posts: posts.rows };
 });
 app.post('/api/profiles/:username/follow', { preHandler: requireAuth }, async (request) => {
   const { username } = request.params as { username: string };
   const target = await query('SELECT id FROM users WHERE lower(username)=lower($1) AND disabled_at IS NULL', [username]);
   if (!target.rows[0]) throw new HttpError(404,'User not found.','NOT_FOUND');
   const targetId = String(target.rows[0].id); if (targetId === request.user.id) throw new HttpError(400,'You cannot follow your own account.','SELF_FOLLOW');
   const result = await withTransaction(async (client) => {
     const deleted = await client.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2 RETURNING follower_id', [request.user.id,targetId]);
     const following = deleted.rowCount === 0;
     if (following) {
       await client.query('INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[request.user.id,targetId]);
       await client.query("INSERT INTO notifications(user_id,actor_id,kind,entity_type,entity_id) VALUES($1,$2,'follow','user',$2)",[targetId,request.user.id]);
     }
     const counts = await client.query('SELECT (SELECT count(*)::int FROM follows WHERE following_id=$1) followers',[targetId]);
     return { following, followers: counts.rows[0]?.followers ?? 0 };
   }); return result;
 });
}
function presentProfile(r: Record<string, any>) {
 return { id:r.id,username:r.username,displayName:r.display_name,role:r.role,createdAt:r.created_at,mode:r.mode,bio:r.bio,pronouns:r.pronouns,avatarUrl:r.avatar_url,bannerUrl:r.banner_url,theme:r.theme,links:r.links,featuredPostIds:r.featured_post_ids,livestreamSchedule:r.livestream_schedule,achievements:r.achievements,followers:r.followers ?? 0,following:r.following ?? 0,isFollowing:r.is_following ?? false,postCount:r.post_count ?? 0 };
}
