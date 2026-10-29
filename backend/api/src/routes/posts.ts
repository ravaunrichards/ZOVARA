import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rm } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../security.js';
import { deleteUploadedMedia, storeUploadedMedia } from '../storage.js';

const captionSchema = z.string().trim().max(2200).default('');
const allowed = new Set(['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp','image/gif']);
function sniff(bytes: Buffer, mime: string) {
 if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
 if (mime === 'image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if (mime === 'image/gif') return bytes.subarray(0,3).toString() === 'GIF';
 if (mime === 'image/webp') return bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
 if (mime.startsWith('video/')) return bytes.subarray(4,8).toString() === 'ftyp' || bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
 return false;
}
function fileExtension(mime: string) { const table: Record<string,string> = {'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}; return table[mime] ?? extname('upload.bin'); }


async function optionalViewer(request: FastifyRequest): Promise<string | null> {
  if (!request.headers.authorization?.startsWith('Bearer ')) return null;
  try {
    await request.jwtVerify();
    const active = await query('SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL', [request.user.id]);
    return active.rows[0] ? String(active.rows[0].id) : null;
  } catch { return null; }
}

async function accessiblePost(postId: string, viewerId: string | null) {
  return query(`SELECT p.author_id FROM posts p
    WHERE p.id=$1 AND p.status='published' AND (
      p.visibility='public' OR p.author_id=$2::uuid OR
      (p.visibility='followers' AND $2::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id=$2::uuid AND f.following_id=p.author_id
      ))
    )`, [postId, viewerId]);
}

export async function postRoutes(app: FastifyInstance) {
 app.get('/api/posts/mine', { preHandler: requireAuth }, async (request) => {
   const r = await query(`SELECT p.id,p.caption,p.media_type,p.media_url,p.thumbnail_url,p.visibility,p.created_at,
     (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) likes,
     (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comments
     FROM posts p WHERE p.author_id=$1 AND p.status='published' ORDER BY p.created_at DESC LIMIT 100`, [request.user.id]);
   return { posts: r.rows };
 });
 app.get('/api/feed', async (request) => {
   const viewerId = await optionalViewer(request);
   const q = request.query as { cursor?: string; limit?: string; following?: string };
   const limit = Math.min(60, Math.max(1, Number(q.limit ?? 20) || 20));
   const cursor = q.cursor ? new Date(q.cursor) : null;
   if (cursor && Number.isNaN(cursor.getTime())) throw new HttpError(400,'Invalid feed cursor.','VALIDATION_ERROR');
   const r = await query(`SELECT p.id,p.caption,p.media_type,p.media_url,p.thumbnail_url,p.created_at,
       u.id author_id,u.username,u.display_name,p.visibility,
       (SELECT avatar_url FROM profiles WHERE user_id=u.id) avatar_url,
       (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) likes,
       (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comments,
       EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) liked,
       EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id=p.id AND s.user_id=$1) bookmarked,
       (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) followers
     FROM posts p JOIN users u ON u.id=p.author_id
     WHERE p.status='published' AND u.disabled_at IS NULL AND p.visibility='public'
       AND ($2::timestamptz IS NULL OR p.created_at < $2)
       AND ($3::boolean = false OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id))
     ORDER BY p.created_at DESC LIMIT $4`, [viewerId,cursor,q.following === 'true',limit]);
   return { posts: r.rows, nextCursor: r.rows.length ? r.rows[r.rows.length-1]!.created_at : null };
 });
 app.post('/api/posts', { preHandler: requireAuth, bodyLimit: (config.MAX_UPLOAD_MB + 2) * 1024 * 1024 }, async (request, reply) => {
   let caption = ''; let visibility: 'public'|'followers'|'private' = 'public'; let savedPath: string | undefined; let mediaUrl: string | null = null; let mediaType: 'video'|'image'|'text' = 'text';
   const uploadDir = resolve(config.UPLOAD_DIR); await mkdir(uploadDir,{recursive:true});
   try {
   for await (const part of request.parts()) {
     if (part.type === 'field') {
       if (part.fieldname === 'caption') { const parsed=captionSchema.safeParse(String(part.value)); if (!parsed.success) throw new HttpError(400,'Caption is too long.','VALIDATION_ERROR'); caption=parsed.data; }
       if (part.fieldname === 'visibility' && ['public','followers','private'].includes(String(part.value))) visibility=String(part.value) as typeof visibility;
     } else {
       if (!allowed.has(part.mimetype)) { part.file.resume(); throw new HttpError(415,'Unsupported media type. Upload MP4/WebM/MOV video or JPEG/PNG/WebP/GIF image.','UNSUPPORTED_MEDIA'); }
       const fileId=randomUUID(); const filename=fileId+fileExtension(part.mimetype); savedPath=resolve(uploadDir,filename);
       await pipeline(part.file,createWriteStream(savedPath,{flags:'wx'}));
       const handle=await open(savedPath,'r'); const head=Buffer.alloc(16); const read=await handle.read(head,0,16,0); await handle.close();
       if (!sniff(head.subarray(0,read.bytesRead),part.mimetype)) { await rm(savedPath,{force:true}); throw new HttpError(415,'The file content does not match its declared media type.','INVALID_MEDIA'); }
       mediaType=part.mimetype.startsWith('image/')?'image':'video'; mediaUrl=await storeUploadedMedia(savedPath, filename, part.mimetype);
     }
   }
   if (!caption && !mediaUrl) throw new HttpError(400,'Add a caption or select media before publishing.','EMPTY_POST');
     const result=await query(`INSERT INTO posts(author_id,caption,media_type,media_url,visibility) VALUES($1,$2,$3,$4,$5)
       RETURNING id,caption,media_type,media_url,visibility,created_at`,[request.user.id,caption,mediaType,mediaUrl,visibility]);
     savedPath=undefined;
     return reply.code(201).send({post:result.rows[0]});
   } catch(error) { if(savedPath) await rm(savedPath,{force:true}); if(mediaUrl) await deleteUploadedMedia(mediaUrl).catch((cleanupError)=>request.log.error({err:cleanupError},'Failed to clean up media after publishing failed')); throw error; }
 });
 app.post('/api/posts/:id/like',{preHandler:requireAuth},async(request)=>{
   const {id}=request.params as {id:string};
   return withTransaction(async(client)=>{
     const post=await client.query(`SELECT p.author_id FROM posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.author_id=$2 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.author_id)))`,[id,request.user.id]);
     if(!post.rows[0]) throw new HttpError(404,'Post not found.','NOT_FOUND');
     const existing=await client.query('DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2 RETURNING user_id',[request.user.id,id]);
     const liked=existing.rowCount===0;
     if(liked){await client.query('INSERT INTO post_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[request.user.id,id]);
       if(String(post.rows[0].author_id)!==request.user.id) await client.query("INSERT INTO notifications(user_id,actor_id,kind,entity_type,entity_id) VALUES($1,$2,'like','post',$3)",[post.rows[0].author_id,request.user.id,id]);}
     const count=await client.query('SELECT count(*)::int n FROM post_likes WHERE post_id=$1',[id]); return {liked,likes:count.rows[0]?.n??0};
   });
 });
 app.post('/api/posts/:id/save',{preHandler:requireAuth},async(request)=>{const {id}=request.params as {id:string};const post=await accessiblePost(id,request.user.id);if(!post.rows[0])throw new HttpError(404,'Post not found.','NOT_FOUND');const removed=await query('DELETE FROM saved_posts WHERE user_id=$1 AND post_id=$2 RETURNING post_id',[request.user.id,id]);const saved=removed.rowCount===0;if(saved)await query('INSERT INTO saved_posts(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[request.user.id,id]);return {saved};});
 app.get('/api/saved',{preHandler:requireAuth},async(request)=>{const r=await query(`SELECT p.id,p.caption,p.media_type,p.media_url,p.thumbnail_url,p.created_at,u.id author_id,u.username,u.display_name,p.visibility,(SELECT avatar_url FROM profiles WHERE user_id=u.id) avatar_url,(SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) likes,(SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comments,EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) liked,true bookmarked FROM saved_posts s JOIN posts p ON p.id=s.post_id JOIN users u ON u.id=p.author_id WHERE s.user_id=$1 AND p.status='published' AND u.disabled_at IS NULL AND (p.visibility='public' OR p.author_id=$1 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id))) ORDER BY s.created_at DESC LIMIT 100`,[request.user.id]);return {posts:r.rows};});
 app.get('/api/posts/:id/comments',async(request)=>{
   const {id}=request.params as {id:string};const viewerId=await optionalViewer(request);const accessible=await accessiblePost(id,viewerId);if(!accessible.rows[0])throw new HttpError(404,'Post not found.','NOT_FOUND');const r=await query(`SELECT c.id,c.body,c.parent_id,c.created_at,u.username,u.display_name,(SELECT avatar_url FROM profiles WHERE user_id=u.id) avatar_url
     FROM comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.created_at ASC LIMIT 200`,[id]); return {comments:r.rows};
 });
 app.post('/api/posts/:id/comments',{preHandler:requireAuth},async(request,reply)=>{
   const {id}=request.params as {id:string}; const parsed=z.object({body:z.string().trim().min(1).max(1200),parentId:z.string().uuid().optional()}).safeParse(request.body);
   if(!parsed.success) throw new HttpError(400,parsed.error.issues[0]?.message??'Invalid comment.','VALIDATION_ERROR');
   const result=await withTransaction(async(client)=>{
     const post=await client.query(`SELECT p.author_id FROM posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.author_id=$2 OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.author_id)))`,[id,request.user.id]); if(!post.rows[0]) throw new HttpError(404,'Post not found.','NOT_FOUND');
     if(parsed.data.parentId){const parent=await client.query('SELECT id FROM comments WHERE id=$1 AND post_id=$2',[parsed.data.parentId,id]);if(!parent.rows[0])throw new HttpError(400,'Reply target must be a comment on the same post.','INVALID_PARENT_COMMENT');}
     const inserted=await client.query('INSERT INTO comments(post_id,author_id,body,parent_id) VALUES($1,$2,$3,$4) RETURNING id,body,parent_id,created_at',[id,request.user.id,parsed.data.body,parsed.data.parentId??null]);
     if(String(post.rows[0].author_id)!==request.user.id) await client.query("INSERT INTO notifications(user_id,actor_id,kind,entity_type,entity_id,payload) VALUES($1,$2,'comment','post',$3,$4::jsonb)",[post.rows[0].author_id,request.user.id,id,JSON.stringify({commentId:inserted.rows[0]!.id})]);
     return inserted.rows[0];
   }); return reply.code(201).send({comment:result});
 });
 app.delete('/api/posts/:id',{preHandler:requireAuth},async(request,reply)=>{
   const {id}=request.params as {id:string}; const r=await query("UPDATE posts SET status='removed',updated_at=now() WHERE id=$1 AND author_id=$2 RETURNING id",[id,request.user.id]);
   if(!r.rowCount) throw new HttpError(404,'Post not found or you do not own it.','NOT_FOUND'); return reply.code(204).send();
 });
}
