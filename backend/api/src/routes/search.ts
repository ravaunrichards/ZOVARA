import type { FastifyInstance } from 'fastify'; import { query } from '../db.js';
export async function searchRoutes(app:FastifyInstance){app.get('/api/search',async(request)=>{const term=String((request.query as {q?:string}).q??'').trim().slice(0,100);if(term.length<2)return {users:[],posts:[],communities:[]};const pattern=`%${term.replace(/[\\%_]/g,'\\$&')}%`;const [u,p,c]=await Promise.all([
 query(`SELECT u.id,u.username,u.display_name,p.mode,p.avatar_url FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.disabled_at IS NULL AND (u.username ILIKE $1 OR u.display_name ILIKE $1) ORDER BY u.username LIMIT 15`,[pattern]),
 query(`SELECT po.id,po.caption,po.media_type,po.media_url,po.created_at,u.username,u.display_name FROM posts po JOIN users u ON u.id=po.author_id WHERE po.status='published' AND po.visibility='public' AND po.caption ILIKE $1 ORDER BY po.created_at DESC LIMIT 20`,[pattern]),
 query(`SELECT id,slug,name,description FROM communities WHERE visibility='public' AND (name ILIKE $1 OR description ILIKE $1) ORDER BY created_at DESC LIMIT 10`,[pattern])
 ]);return {users:u.rows,posts:p.rows,communities:c.rows};});}
