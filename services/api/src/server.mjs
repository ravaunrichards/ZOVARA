import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {readConfig} from '../../../packages/configuration/src/index.mjs';
import {cleanText,isUuid,isSafeHandle,boundedInt} from '../../../packages/validation/src/index.mjs';
import {SupabaseProvider} from './providers/supabase.mjs';
import {PayPalProvider} from './providers/paypal.mjs';
import {LiveKitProvider} from './providers/livekit.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const WEB_ROOT=path.join(ROOT,'apps/web');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
class HttpError extends Error { constructor(status,code,message){super(message);this.statusCode=status;this.code=code;} }
const config=readConfig();
const supabase=new SupabaseProvider(config);
const paypal=new PayPalProvider(config);
const livekit=new LiveKitProvider(config);
const rate=new Map();
const featuresPath=path.join(ROOT,'reports/implementation-inventory.json');
const giftsPath=path.join(ROOT,'assets/gifts/catalog.json');
const levelsPath=path.join(ROOT,'assets/badges/gifter-levels.json');
const stylesPath=path.join(ROOT,'assets/styles/registry.json');

function log(level,event,fields={}){const row={ts:new Date().toISOString(),level,event,...fields};process.stdout.write(JSON.stringify(row)+'\n');}
function json(res,status,obj,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(obj));}
function errResponse(res,error,requestId){const status=Number.isInteger(error.statusCode)?error.statusCode:500;const code=error.code||'INTERNAL_ERROR';const message=status>=500&&code==='INTERNAL_ERROR'?'Unexpected server error':String(error.message||'Request failed');json(res,status,{data:null,error:{code,message},meta:{requestId}});}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):null;}
async function bodyJson(req,max=1024*1024){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>max)throw new HttpError(413,'PAYLOAD_TOO_LARGE','Request body is too large');chunks.push(chunk);}if(!chunks.length)return {};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'VALIDATION_ERROR','Request body must be valid JSON');}}
async function auth(req){return {user:await supabase.userFromToken(bearer(req)),token:bearer(req)};}
function requireUuid(value,label='id'){if(!isUuid(value))throw new HttpError(400,'VALIDATION_ERROR',`Invalid ${label}`);return value;}
async function rpc(name,body,{token,service=false}={}){return supabase.request(`/rest/v1/rpc/${name}`,{method:'POST',body,token,service});}
async function selectOne(table,query,{token,service=false}={}){const rows=await supabase.request(`/rest/v1/${table}?${query}`,{token,service});return Array.isArray(rows)?rows[0]||null:rows;}
async function insertOne(table,body,{token,service=false}={}){const rows=await supabase.request(`/rest/v1/${table}?select=*`,{method:'POST',body,token,service,headers:{Prefer:'return=representation'}});return Array.isArray(rows)?rows[0]||null:rows;}
async function patchRows(table,query,body,{token,service=false}={}){return supabase.request(`/rest/v1/${table}?${query}`,{method:'PATCH',body,token,service,headers:{Prefer:'return=representation'}});}
function apiFeatureList(){return {version:'v1',providerStatus:{supabase:supabase.configured()?'configured':'not_configured',paypal:paypal.configured()?'configured':'not_configured',livekit:livekit.configured()?'configured':'not_configured',payoutsEnabled:config.paypalPayoutsEnabled},productStatus:'foundation-partial'};}
async function handleApi(req,res,url,requestId){
 const method=req.method||'GET', p=url.pathname;
 if(method==='GET'&&p==='/api/v1/health')return json(res,200,{data:{status:'ok',service:'zovara-api',version:'0.1.0',time:new Date().toISOString(),providers:apiFeatureList().providerStatus},error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/health/livekit'){
   const provider=await livekit.healthCheck();
   const status=provider.reachable?200:503;
   return json(res,status,{data:{provider:'livekit',...provider},error:provider.reachable?null:{code:provider.code,message:provider.code==='CONFIGURATION_REQUIRED'?'LiveKit credentials are not configured':'LiveKit room service could not be reached'},meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/client-config')return json(res,200,{data:{supabaseUrl:config.supabaseUrl||null,supabaseAnonKey:config.supabaseAnonKey||null,livekitUrl:config.livekitUrl||null,paypalEnvironment:config.paypalEnvironment,providers:apiFeatureList().providerStatus},error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/features')return json(res,200,{data:JSON.parse(await readFile(featuresPath,'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/catalog/gifts')return json(res,200,{data:JSON.parse(await readFile(giftsPath,'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/catalog/gifter-levels')return json(res,200,{data:JSON.parse(await readFile(levelsPath,'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/catalog/styles') {const reg=JSON.parse(await readFile(stylesPath,'utf8'));return json(res,200,{data:{version:reg.version,count:reg.count,combinationDimensions:reg.combinationDimensions},error:null,meta:{requestId}});}
 if(method==='GET'&&p==='/api/v1/catalog/icons')return json(res,200,{data:JSON.parse(await readFile(path.join(ROOT,'assets/icons/manifest.json'),'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/wallet/packages'){
   const rows=await supabase.request('/rest/v1/coin_packages?select=id,name,coins,price_usd_cents&is_active=eq.true&is_custom=eq.false&order=sort_order.asc');
   return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/live'){
   const rows=await supabase.request('/rest/v1/live_sessions?select=id,host_id,title,visibility,status,started_at,current_viewer_count,room_name&status=eq.live&visibility=eq.public&order=started_at.desc&limit=30');
   return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/search/profiles'){
   const q=cleanText(url.searchParams.get('q')||'',40);if(q.length<2)return json(res,200,{data:[],error:null,meta:{requestId}});
   const encoded=encodeURIComponent(`*${q}*`);const rows=await supabase.request(`/rest/v1/profiles?select=id,handle,display_name,avatar_path,bio&deleted_at=is.null&or=(handle.ilike.${encoded},display_name.ilike.${encoded})&limit=20`);
   return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/me'){
   const {user,token}=await auth(req);const profile=await selectOne('profiles',`id=eq.${user.id}&select=id,handle,display_name,bio,avatar_path,cover_path,role,visibility,country_code,locale,timezone,is_verified,created_at`,{token});
   return json(res,200,{data:{user:{id:user.id,email:user.email},profile},error:null,meta:{requestId}});
 }
 if(method==='PATCH'&&p==='/api/v1/me'){
   const {user,token}=await auth(req);const b=await bodyJson(req);const fields={};
   if(b.displayName!==undefined)fields.display_name=cleanText(b.displayName,60);
   if(b.bio!==undefined)fields.bio=cleanText(b.bio,500);
   if(b.handle!==undefined){if(!isSafeHandle(b.handle))throw new HttpError(400,'VALIDATION_ERROR','Handle must be 3–30 letters, numbers, underscores, or periods');fields.handle=b.handle.toLowerCase();}
   if(b.visibility!==undefined){if(!['public','private'].includes(b.visibility))throw new HttpError(400,'VALIDATION_ERROR','Invalid profile visibility');fields.visibility=b.visibility;}
   if(b.avatarPath!==undefined){const value=cleanText(b.avatarPath,500);if(value&&!value.startsWith(`${user.id}/`))throw new HttpError(403,'FORBIDDEN','Avatar path must belong to the signed-in account');fields.avatar_path=value||null;}
   if(b.coverPath!==undefined){const value=cleanText(b.coverPath,500);if(value&&!value.startsWith(`${user.id}/`))throw new HttpError(403,'FORBIDDEN','Cover path must belong to the signed-in account');fields.cover_path=value||null;}
   if(!Object.keys(fields).length)throw new HttpError(400,'VALIDATION_ERROR','No editable profile fields were provided');
   const rows=await patchRows('profiles',`id=eq.${user.id}`,fields,{token});return json(res,200,{data:Array.isArray(rows)?rows[0]:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/feed'){
   const mode=url.searchParams.get('mode')||'for-you';let token=bearer(req),user=null,filters=[];
   if(url.searchParams.has('authorId')){const target=requireUuid(url.searchParams.get('authorId'),'author id');if(token)user=await supabase.userFromToken(token);filters.push(`author_id=eq.${target}`);}
   else if(mode==='following'){if(!token)throw new HttpError(401,'UNAUTHENTICATED','Sign in to load the Following feed');user=await supabase.userFromToken(token);const edges=await supabase.request(`/rest/v1/follows?follower_id=eq.${user.id}&select=followed_id&limit=1000`,{token});const ids=(edges||[]).map(x=>x.followed_id);if(!ids.length)return json(res,200,{data:[],error:null,meta:{requestId}});filters.push(`author_id=in.(${ids.join(',')})`);}
   else if(token)user=await supabase.userFromToken(token);
   filters.push('status=eq.published','deleted_at=is.null');if(!url.searchParams.has('authorId')&&mode!=='following')filters.push('visibility=eq.public');
   const query=`select=id,author_id,body,hashtags,visibility,status,published_at,created_at&${filters.join('&')}&order=published_at.desc.nullslast&limit=30`;
   const rows=await supabase.request(`/rest/v1/posts?${query}`,{token});const ids=[...new Set((rows||[]).map(x=>x.author_id))];let profiles=[],likes=[],liked=[];
   if(ids.length){const inList=ids.join(',');profiles=await supabase.request(`/rest/v1/profiles?select=id,handle,display_name,avatar_path,bio&id=in.(${inList})`,{token});}
   const postIds=[...new Set((rows||[]).map(x=>x.id))];if(postIds.length){const q=`/rest/v1/post_likes?select=post_id&post_id=in.(${postIds.join(',')})`;likes=await supabase.request(q,{token});if(user)liked=await supabase.request(`/rest/v1/post_likes?select=post_id&user_id=eq.${user.id}&post_id=in.(${postIds.join(',')})`,{token});}
   const byId=new Map((profiles||[]).map(x=>[x.id,x]));const counts=new Map();for(const x of likes||[])counts.set(x.post_id,(counts.get(x.post_id)||0)+1);const likedSet=new Set((liked||[]).map(x=>x.post_id));return json(res,200,{data:(rows||[]).map(r=>({...r,author:byId.get(r.author_id)||null,likeCount:counts.get(r.id)||0,likedByMe:likedSet.has(r.id)})),error:null,meta:{requestId}});
 }
 const postMatch=p.match(/^\/api\/v1\/posts\/([0-9a-f-]+)$/i);
 if(postMatch&&method==='GET'){
   const postId=requireUuid(postMatch[1],'post id');const token=bearer(req);const viewer=token?await supabase.userFromToken(token):null;const row=await selectOne('posts',`id=eq.${postId}&select=id,author_id,body,hashtags,visibility,status,deleted_at,comments_enabled,like_count,published_at,created_at`,{token});if(!row||row.status!=='published'||row.deleted_at)throw new HttpError(404,'NOT_FOUND','Post not found');
   let permitted=row.visibility==='public'||row.author_id===viewer?.id;
   if(!permitted&&viewer&&row.visibility==='followers'){const edge=await selectOne('follows',`follower_id=eq.${viewer.id}&followed_id=eq.${row.author_id}&select=follower_id`,{token});permitted=!!edge;}
   if(!permitted&&viewer&&row.visibility==='friends'){const friendship=await supabase.request(`/rest/v1/friendships?or=(and(requester_id.eq.${viewer.id},addressee_id.eq.${row.author_id}),and(requester_id.eq.${row.author_id},addressee_id.eq.${viewer.id}))&status=eq.accepted&select=id&limit=1`,{token});permitted=Array.isArray(friendship)&&friendship.length>0;}
   if(!permitted)throw new HttpError(404,'NOT_FOUND','Post not found');const author=await selectOne('profiles',`id=eq.${row.author_id}&select=id,handle,display_name,avatar_path,bio`,{token});let likeCount=Number(row.like_count)||0,likedByMe=false;if(viewer){const mine=await selectOne('post_likes',`post_id=eq.${postId}&user_id=eq.${viewer.id}&select=post_id`,{token});likedByMe=!!mine;}return json(res,200,{data:{...row,author,likeCount,likedByMe},error:null,meta:{requestId}});
 }
 const likeMatch=p.match(/^\/api\/v1\/posts\/([0-9a-f-]+)\/like$/i);
 if(likeMatch&&(method==='POST'||method==='DELETE')){
   const {user,token}=await auth(req);const postId=requireUuid(likeMatch[1],'post id');const post=await selectOne('posts',`id=eq.${postId}&select=id,status`,{token});if(!post||post.status!=='published')throw new HttpError(404,'NOT_FOUND','Post is not available');
   if(method==='POST'){try{await insertOne('post_likes',{post_id:postId,user_id:user.id},{token});}catch(e){if(!String(e.message).toLowerCase().includes('duplicate')&&!String(e.message).toLowerCase().includes('unique'))throw e;}}
   else await supabase.request(`/rest/v1/post_likes?post_id=eq.${postId}&user_id=eq.${user.id}`,{method:'DELETE',token});
   const rows=await supabase.request(`/rest/v1/post_likes?post_id=eq.${postId}&select=user_id`,{token});return json(res,200,{data:{postId,liked:method==='POST',likeCount:(rows||[]).length},error:null,meta:{requestId}});
 }
 const commentMatch=p.match(/^\/api\/v1\/posts\/([0-9a-f-]+)\/comments$/i);
 if(commentMatch&&method==='GET'){
   const token=bearer(req);if(token)await supabase.userFromToken(token);const postId=requireUuid(commentMatch[1],'post id');const rows=await supabase.request(`/rest/v1/comments?post_id=eq.${postId}&status=eq.visible&select=id,post_id,author_id,parent_id,body,created_at&order=created_at.asc&limit=100`,{token});const ids=[...new Set((rows||[]).map(x=>x.author_id))];let profiles=[];if(ids.length)profiles=await supabase.request(`/rest/v1/profiles?select=id,handle,display_name&id=in.(${ids.join(',')})`,{token});const m=new Map(profiles.map(x=>[x.id,x]));return json(res,200,{data:rows.map(x=>({...x,author:m.get(x.author_id)||null})),error:null,meta:{requestId}});
 }
 if(commentMatch&&method==='POST'){
   const {user,token}=await auth(req);const postId=requireUuid(commentMatch[1],'post id');const b=await bodyJson(req);const body=cleanText(b.body,2000);if(!body)throw new HttpError(400,'VALIDATION_ERROR','Comment cannot be empty');const post=await selectOne('posts',`id=eq.${postId}&select=id,author_id,comments_enabled,status`,{token});if(!post||post.status!=='published'||!post.comments_enabled)throw new HttpError(409,'CONFLICT','Comments are not available for this post');const row=await insertOne('comments',{post_id:postId,author_id:user.id,body,parent_id:b.parentId&&isUuid(b.parentId)?b.parentId:null},{token});return json(res,201,{data:row,error:null,meta:{requestId}});
 }
 const saveMatch=p.match(/^\/api\/v1\/posts\/([0-9a-f-]+)\/save$/i);
 if(saveMatch&&method==='POST'){
   const {user,token}=await auth(req);const postId=requireUuid(saveMatch[1],'post id');const post=await selectOne('posts',`id=eq.${postId}&select=id,status`,{token});if(!post||post.status!=='published')throw new HttpError(404,'NOT_FOUND','Post is not available');let collection=await selectOne('collections',`owner_id=eq.${user.id}&name=eq.Favorites&select=id`,{token});if(!collection)collection=await insertOne('collections',{owner_id:user.id,name:'Favorites',is_private:true},{token});try{await insertOne('collection_posts',{collection_id:collection.id,post_id:postId},{token});}catch(e){if(!String(e.message).toLowerCase().includes('duplicate')&&!String(e.message).toLowerCase().includes('unique'))throw e;}return json(res,200,{data:{saved:true,collectionId:collection.id,postId},error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/reports'){
   const {user,token}=await auth(req);const b=await bodyJson(req);const targetType=cleanText(b.targetType,24),targetId=cleanText(b.targetId,100),reason=cleanText(b.reason,100),details=cleanText(b.details,3000);if(!['profile','post','comment','live','message','gift','payment'].includes(targetType)||!targetId||!reason)throw new HttpError(400,'VALIDATION_ERROR','Report target and reason are required');const row=await insertOne('reports',{reporter_id:user.id,target_type:targetType,target_id:targetId,reason,details},{token});return json(res,201,{data:{id:row.id,status:row.status},error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/notifications'){
   const {user,token}=await auth(req);const rows=await supabase.request(`/rest/v1/notifications?recipient_id=eq.${user.id}&select=id,actor_id,kind,payload,read_at,created_at&order=created_at.desc&limit=100`,{token});return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/me/blocks'){
   const {user,token}=await auth(req);const rows=await supabase.request(`/rest/v1/blocks?blocker_id=eq.${user.id}&select=blocked_id,created_at&order=created_at.desc`,{token});const ids=rows.map(x=>x.blocked_id);const profiles=ids.length?await supabase.request(`/rest/v1/profiles?select=id,handle,display_name&id=in.(${ids.join(',')})`,{token}):[];const m=new Map(profiles.map(x=>[x.id,x]));return json(res,200,{data:rows.map(x=>({...x,profile:m.get(x.blocked_id)||null})),error:null,meta:{requestId}});
 }
 const blockMatch=p.match(/^\/api\/v1\/profiles\/([0-9a-f-]+)\/block$/i);
 if(blockMatch&&(method==='POST'||method==='DELETE')){
   const {user,token}=await auth(req);const target=requireUuid(blockMatch[1],'profile id');if(target===user.id)throw new HttpError(400,'VALIDATION_ERROR','You cannot block your own account');if(method==='POST'){await insertOne('blocks',{blocker_id:user.id,blocked_id:target},{token}).catch(e=>{if(!String(e.message).toLowerCase().includes('duplicate')&&!String(e.message).toLowerCase().includes('unique'))throw e;});await supabase.request(`/rest/v1/follows?or=(and(follower_id.eq.${user.id},followed_id.eq.${target}),and(follower_id.eq.${target},followed_id.eq.${user.id}))`,{method:'DELETE',service:true}).catch(()=>{});}else await supabase.request(`/rest/v1/blocks?blocker_id=eq.${user.id}&blocked_id=eq.${target}`,{method:'DELETE',token});return json(res,200,{data:{userId:target,blocked:method==='POST'},error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/posts'){
   const {user,token}=await auth(req);const b=await bodyJson(req);const body=cleanText(b.body,4000);if(!body&&!Array.isArray(b.mediaIds))throw new HttpError(400,'VALIDATION_ERROR','Post text or media is required');
   const visibility=b.visibility||'public';if(!['public','followers','friends','private','subscriber'].includes(visibility))throw new HttpError(400,'VALIDATION_ERROR','Invalid audience');
   const row=await insertOne('posts',{author_id:user.id,body,hashtags:Array.isArray(b.hashtags)?b.hashtags.slice(0,30).map(x=>cleanText(x,60).replace(/^#/,'')).filter(Boolean):[],visibility,status:'published',published_at:new Date().toISOString(),comments_enabled:b.commentsEnabled!==false},{token});
   if(Array.isArray(b.mediaIds)&&b.mediaIds.length){for(let i=0;i<Math.min(10,b.mediaIds.length);i++){const mid=b.mediaIds[i];if(!isUuid(mid))throw new HttpError(400,'VALIDATION_ERROR','Invalid media identifier');await insertOne('post_media',{post_id:row.id,media_id:mid,position:i},{token});}}
   return json(res,201,{data:row,error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/media/upload-url'){
   const {user}=await auth(req);const b=await bodyJson(req);const filename=cleanText(b.filename,120).replace(/[^a-zA-Z0-9_.-]/g,'_');const mime=cleanText(b.mimeType,100);const size=Number(b.size);
   if(!filename||!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/mpeg'].includes(mime)||!Number.isSafeInteger(size)||size<1||size>config.maxUploadBytes)throw new HttpError(400,'VALIDATION_ERROR','Filename, supported media MIME type, or file size is invalid');
   const objectPath=`${user.id}/${randomUUID()}-${filename}`;const encoded=objectPath.split('/').map(encodeURIComponent).join('/');
   const base=config.supabaseUrl.replace(/\/$/,'');if(!supabase.serviceConfigured())throw new HttpError(503,'CONFIGURATION_REQUIRED','Supabase Storage server credentials are not configured');
   const r=await fetch(`${base}/storage/v1/object/upload/sign/${encodeURIComponent(config.mediaBucket)}/${encoded}`,{method:'POST',headers:{apikey:config.supabaseServiceRoleKey,Authorization:`Bearer ${config.supabaseServiceRoleKey}`,'Content-Type':'application/json'},body:JSON.stringify({upsert:false}),signal:AbortSignal.timeout(15000)});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new HttpError(502,'PROVIDER_ERROR','Could not create signed upload URL. Confirm the private media bucket exists and storage policies are configured.');
   const signed= d.signedURL || d.signedUrl || d.url;if(!signed)throw new HttpError(502,'PROVIDER_ERROR','Storage provider did not return a signed upload URL');
   return json(res,201,{data:{bucket:config.mediaBucket,path:objectPath,token:d.token||null,signedUrl:signed,uploadUrl:signed.startsWith('http')?signed:`${base}/storage/v1${signed}`,mimeType:mime,maxBytes:config.maxUploadBytes},error:null,meta:{requestId}});
 }
 const followMatch=p.match(/^\/api\/v1\/profiles\/([0-9a-f-]+)\/follow$/i);
 if(followMatch&&(method==='POST'||method==='DELETE')){
   const {user,token}=await auth(req);const target=requireUuid(followMatch[1],'profile id');if(target===user.id)throw new HttpError(400,'VALIDATION_ERROR','You cannot follow yourself');
   if(method==='POST'){
    const blocked=await selectOne('blocks',`select=blocker_id&or=(and(blocker_id.eq.${user.id},blocked_id.eq.${target}),and(blocker_id.eq.${target},blocked_id.eq.${user.id}))`,{service:true});if(blocked)throw new HttpError(403,'FORBIDDEN','Follow unavailable due to privacy settings');
    try{await insertOne('follows',{follower_id:user.id,followed_id:target},{token});}catch(e){if(!String(e.message).toLowerCase().includes('duplicate'))throw e;}
   }else await supabase.request(`/rest/v1/follows?follower_id=eq.${user.id}&followed_id=eq.${target}`,{method:'DELETE',token});
   return json(res,200,{data:{following:method==='POST',userId:target},error:null,meta:{requestId}});
 }
 const giftMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/gifts$/i);
 if(giftMatch&&method==='POST'){
   const {user,token}=await auth(req);const liveId=requireUuid(giftMatch[1],'live session id');const b=await bodyJson(req);const giftId=cleanText(b.giftId,40);const key=cleanText(req.headers['idempotency-key']||b.idempotencyKey,120);if(!/^gift-\d{3}$/.test(giftId)||key.length<8)throw new HttpError(400,'VALIDATION_ERROR','Gift ID and idempotency key are required');
   const result=await rpc('send_gift_transaction',{p_live_session_id:liveId,p_gift_id:giftId,p_idempotency_key:key},{token});return json(res,201,{data:result,error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/lives'){
   const {user,token}=await auth(req);
   if(!livekit.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','LiveKit is not configured; no live session was started');
   const b=await bodyJson(req);
   const title=cleanText(b.title||'Live on ZOVARA',120);
   const visibility=b.visibility||'public';
   if(!['public','private','followers','subscribers','age_restricted'].includes(visibility))throw new HttpError(400,'VALIDATION_ERROR','Invalid live visibility');
   const id=randomUUID(),roomName='zovara-'+id;
   const session=await insertOne('live_sessions',{id,host_id:user.id,title,visibility,status:'scheduled',room_name:roomName},{token});
   let roomCreated=false;
   try{
     await livekit.createRoom(roomName,config.livekitDefaultRoomMaxParticipants||100);
     roomCreated=true;
     const startedAt=new Date().toISOString();
     await patchRows('live_sessions','id=eq.'+id,{status:'live',started_at:startedAt},{service:true});
     await insertOne('live_participants',{live_session_id:id,user_id:user.id,role:'host',status:'joined',can_publish_audio:true,can_publish_video:true,joined_at:startedAt},{service:true});
     const tokenValue=livekit.createParticipantToken({identity:user.id,name:cleanText(user.user_metadata?.display_name||user.email?.split('@')[0]||'Creator',80),room:roomName,canPublish:true,canSubscribe:true,canPublishData:true});
     return json(res,201,{data:{...session,status:'live',livekitUrl:config.livekitUrl,participantToken:tokenValue,permissions:{canPublish:true,canModerate:true}},error:null,meta:{requestId}});
   }catch(error){
     if(roomCreated)await livekit.deleteRoom(roomName).catch(()=>{});
     await patchRows('live_sessions','id=eq.'+id,{status:'failed',ended_at:new Date().toISOString()},{service:true}).catch(()=>{});
     throw error;
   }
 }
 const liveTokenMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/token$/i);
 if(liveTokenMatch&&method==='POST'){
   const {user,token}=await auth(req);const liveId=requireUuid(liveTokenMatch[1],'live session id');if(!livekit.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','LiveKit is not configured');
   const live=await selectOne('live_sessions',`id=eq.${liveId}&select=id,host_id,room_name,status,visibility,title`,{service:true});if(!live||live.status!=='live')throw new HttpError(404,'NOT_FOUND','Live session is not active');
   const host=live.host_id===user.id;let participant=null;
   if(!host){
     const blocked=await selectOne('blocks',`or=(and(blocker_id.eq.${user.id},blocked_id.eq.${live.host_id}),and(blocker_id.eq.${live.host_id},blocked_id.eq.${user.id}))&select=blocker_id`,{service:true});if(blocked)throw new HttpError(403,'FORBIDDEN','This room is unavailable due to block settings');
     participant=await selectOne('live_participants',`live_session_id=eq.${liveId}&user_id=eq.${user.id}&status=eq.joined&select=role,can_publish_audio,can_publish_video`,{service:true});
     if(!participant){
       if(live.visibility==='private')throw new HttpError(403,'FORBIDDEN','Access to this private room was not granted');
       if(live.visibility==='followers'){const edge=await selectOne('follows',`follower_id=eq.${user.id}&followed_id=eq.${live.host_id}&select=follower_id`,{service:true});if(!edge)throw new HttpError(403,'FORBIDDEN','This room is limited to the host’s followers');}
       if(live.visibility==='subscribers')throw new HttpError(403,'FORBIDDEN','Subscriber entitlement verification is not configured for this room');
       if(live.visibility==='age_restricted')throw new HttpError(403,'FORBIDDEN','Age eligibility must be verified before joining this room');
       try{await insertOne('live_participants',{live_session_id:liveId,user_id:user.id,role:'viewer',status:'joined',can_publish_audio:false,can_publish_video:false,joined_at:new Date().toISOString()},{service:true});}
       catch{await patchRows('live_participants',`live_session_id=eq.${liveId}&user_id=eq.${user.id}`,{role:'viewer',status:'joined',can_publish_audio:false,can_publish_video:false,joined_at:new Date().toISOString(),left_at:null},{service:true});}
       participant={role:'viewer',can_publish_audio:false,can_publish_video:false};
     }
   }
   const canPublish=host||(['guest','cohost'].includes(participant?.role)&&participant?.can_publish_audio===true&&participant?.can_publish_video===true);const canModerate=host||participant?.role==='moderator';
   const tokenValue=livekit.createParticipantToken({identity:user.id,name:cleanText(user.user_metadata?.display_name||user.email?.split('@')[0]||'Viewer',80),room:live.room_name,canPublish,canSubscribe:true,canPublishData:true});
   return json(res,200,{data:{token:tokenValue,serverUrl:config.livekitUrl,role:host?'host':(participant?.role||'viewer'),permissions:{canPublish,canModerate}},error:null,meta:{requestId}});
 }
 const liveLeaveMatch=p.match(/^\\/api\\/v1\\/lives\\/([0-9a-f-]+)\\/leave$/i);
 if(liveLeaveMatch&&method==='POST'){
   const {user}=await auth(req);
   const liveId=requireUuid(liveLeaveMatch[1],'live session id');
   const live=await selectOne('live_sessions','id=eq.'+liveId+'&select=id,host_id,status',{service:true});
   if(!live)throw new HttpError(404,'NOT_FOUND','Live session not found');
   if(live.host_id===user.id)throw new HttpError(409,'CONFLICT','The host must end the livestream instead of leaving it');
   const participant=await selectOne('live_participants','live_session_id=eq.'+liveId+'&user_id=eq.'+user.id+'&select=id,status',{service:true});
   if(!participant||participant.status!=='joined')return json(res,200,{data:{liveSessionId:liveId,left:false,replayed:true},error:null,meta:{requestId}});
   await patchRows('live_participants','live_session_id=eq.'+liveId+'&user_id=eq.'+user.id+'&status=eq.joined',{status:'left',left_at:new Date().toISOString(),can_publish_audio:false,can_publish_video:false},{service:true});
   return json(res,200,{data:{liveSessionId:liveId,left:true},error:null,meta:{requestId}});
 }
 const liveChatMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/chat$/i);
 if(liveChatMatch&&(method==='GET'||method==='POST')){
   const {user,token}=await auth(req);const liveId=requireUuid(liveChatMatch[1],'live session id');const live=await selectOne('live_sessions',`id=eq.${liveId}&select=id,status,host_id,visibility`,{token});if(!live||live.status!=='live')throw new HttpError(404,'NOT_FOUND','Live room is not active');
   if(method==='POST'){const b=await bodyJson(req);const body=cleanText(b.body,1000);if(!body)throw new HttpError(400,'VALIDATION_ERROR','Chat message cannot be empty');const row=await insertOne('live_chat_messages',{live_session_id:liveId,sender_id:user.id,body,status:'visible'},{token});return json(res,201,{data:row,error:null,meta:{requestId}});}
   const rows=await supabase.request(`/rest/v1/live_chat_messages?live_session_id=eq.${liveId}&status=eq.visible&select=id,sender_id,body,created_at&order=created_at.asc&limit=100`,{token});const ids=[...new Set(rows.map(x=>x.sender_id))];const profiles=ids.length?await supabase.request(`/rest/v1/profiles?select=id,handle,display_name&id=in.(${ids.join(',')})`,{token}):[];const map=new Map(profiles.map(x=>[x.id,x]));return json(res,200,{data:rows.map(x=>({...x,sender:map.get(x.sender_id)||null})),error:null,meta:{requestId}});
 }
 const liveGiftsMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/gifts$/i);
 if(liveGiftsMatch&&method==='GET'){
   const token=bearer(req);const liveId=requireUuid(liveGiftsMatch[1],'live session id');if(token)await supabase.userFromToken(token);const rows=await supabase.request(`/rest/v1/gift_transactions?live_session_id=eq.${liveId}&status=eq.confirmed&select=id,gift_id,sender_id,coin_amount,created_at&order=created_at.desc&limit=30`,{token});const giftIds=[...new Set(rows.map(x=>x.gift_id))],userIds=[...new Set(rows.map(x=>x.sender_id))];const gifts=giftIds.length?await supabase.request(`/rest/v1/gifts?select=id,name,category,coin_price&id=in.(${giftIds.join(',')})`,{token}):[];const profiles=userIds.length?await supabase.request(`/rest/v1/profiles?select=id,handle,display_name&id=in.(${userIds.join(',')})`,{token}):[];const gm=new Map(gifts.map(x=>[x.id,x])),pm=new Map(profiles.map(x=>[x.id,x]));return json(res,200,{data:rows.map(x=>({...x,gift:gm.get(x.gift_id)||null,sender:pm.get(x.sender_id)||null})),error:null,meta:{requestId}});
 }
 const guestDecisionMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/guest-requests\/([0-9a-f-]+)\/decision$/i);
 if(guestDecisionMatch&&method==='POST'){
   const {user}=await auth(req);const liveId=requireUuid(guestDecisionMatch[1],'live session id'),requestIdParam=requireUuid(guestDecisionMatch[2],'guest request id');const live=await selectOne('live_sessions',`id=eq.${liveId}&select=id,host_id,room_name,status`,{service:true});if(!live)throw new HttpError(404,'NOT_FOUND','Live room not found');if(live.host_id!==user.id)throw new HttpError(403,'FORBIDDEN','Only the room host can decide guest requests');const b=await bodyJson(req);if(!['accepted','rejected'].includes(b.decision))throw new HttpError(400,'VALIDATION_ERROR','Decision must be accepted or rejected');const gr=await selectOne('live_guest_requests',`id=eq.${requestIdParam}&live_session_id=eq.${liveId}&status=eq.pending&select=id,requester_id,requested_role`,{service:true});if(!gr)throw new HttpError(404,'NOT_FOUND','Pending guest request not found');await patchRows('live_guest_requests',`id=eq.${gr.id}`,{status:b.decision,handled_by:user.id,handled_at:new Date().toISOString()},{service:true});if(b.decision==='rejected')return json(res,200,{data:{requestId:gr.id,status:'rejected'},error:null,meta:{requestId}});await insertOne('live_participants',{live_session_id:liveId,user_id:gr.requester_id,role:gr.requested_role,status:'joined',can_publish_audio:true,can_publish_video:true,joined_at:new Date().toISOString()},{service:true}).catch(async e=>{await patchRows('live_participants',`live_session_id=eq.${liveId}&user_id=eq.${gr.requester_id}`,{role:gr.requested_role,status:'joined',can_publish_audio:true,can_publish_video:true,joined_at:new Date().toISOString()},{service:true});});const profile=await selectOne('profiles',`id=eq.${gr.requester_id}&select=display_name,handle`,{service:true});const tok=livekit.createParticipantToken({identity:gr.requester_id,name:cleanText(profile?.display_name||profile?.handle||'Guest',80),room:live.room_name,canPublish:true});return json(res,200,{data:{requestId:gr.id,status:'accepted',role:gr.requested_role,serverUrl:config.livekitUrl,token:tok},error:null,meta:{requestId}});
 }
 const liveEndMatch=p.match(/^\\/api\\/v1\\/lives\\/([0-9a-f-]+)\\/end$/i);
 if(liveEndMatch&&method==='POST'){
   const {user}=await auth(req);
   const liveId=requireUuid(liveEndMatch[1],'live session id');
   const live=await selectOne('live_sessions','id=eq.'+liveId+'&select=id,host_id,room_name,status',{service:true});
   if(!live)throw new HttpError(404,'NOT_FOUND','Live session not found');
   if(live.host_id!==user.id)throw new HttpError(403,'FORBIDDEN','Only the host can end this live session');
   if(live.status==='ended')return json(res,200,{data:{id:liveId,status:'ended',replayed:true},error:null,meta:{requestId}});
   if(livekit.configured())await livekit.deleteRoom(live.room_name);
   const endedAt=new Date().toISOString();
   await patchRows('live_participants','live_session_id=eq.'+liveId+'&status=eq.joined',{status:'left',left_at:endedAt,can_publish_audio:false,can_publish_video:false},{service:true});
   await patchRows('live_sessions','id=eq.'+liveId,{status:'ended',ended_at:endedAt,current_viewer_count:0},{service:true});
   return json(res,200,{data:{id:liveId,status:'ended'},error:null,meta:{requestId}});
 }
 const guestMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/guest-requests$/i);
 if(guestMatch&&method==='POST'){
   const {user,token}=await auth(req);const liveId=requireUuid(guestMatch[1],'live session id');const b=await bodyJson(req);const requestedRole=['guest','cohost'].includes(b.role)?b.role:'guest';
   const live=await selectOne('live_sessions',`id=eq.${liveId}&select=id,status,host_id`,{token});if(!live||live.status!=='live')throw new HttpError(404,'NOT_FOUND','Live session is not active');
   const result=await insertOne('live_guest_requests',{live_session_id:liveId,requester_id:user.id,requested_role:requestedRole,status:'pending'},{token});return json(res,201,{data:result,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/wallet'){
   const {user,token}=await auth(req);const wallet=await selectOne('wallets',`user_id=eq.${user.id}&select=user_id,coin_balance,locked_coins,updated_at`,{token});const earnings=await selectOne('creator_earnings',`creator_id=eq.${user.id}&select=pending_usd_cents,available_usd_cents,paid_usd_cents`,{token});const gifter=await selectOne('gifter_profiles',`user_id=eq.${user.id}&select=eligible_coins_spent,level,updated_at`,{token});
   return json(res,200,{data:{coins:wallet?.coin_balance||0,lockedCoins:wallet?.locked_coins||0,earnings:{pendingUsdCents:earnings?.pending_usd_cents||0,availableUsdCents:earnings?.available_usd_cents||0,paidUsdCents:earnings?.paid_usd_cents||0},gifterLevel:gifter?.level||0,eligibleCoinsSpent:gifter?.eligible_coins_spent||0},error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/wallet/ledger'){
   const {user,token}=await auth(req);const rows=await supabase.request(`/rest/v1/ledger_entries?user_id=eq.${user.id}&select=id,entry_type,currency,amount_minor,balance_after,reference_type,reference_id,metadata,created_at&order=created_at.desc&limit=100`,{token});return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/payments/orders'){
   const {user,token}=await auth(req);const b=await bodyJson(req);const idempotency=cleanText(req.headers['idempotency-key']||b.idempotencyKey||randomUUID(),120);
   let packageId=null,coins,amountCents;
   if(b.packageId){packageId=cleanText(b.packageId,50);const pack=await selectOne('coin_packages',`id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&is_custom=eq.false&select=id,name,coins,price_usd_cents`,{token});if(!pack)throw new HttpError(400,'VALIDATION_ERROR','Coin package is unavailable');coins=Number(pack.coins);amountCents=Number(pack.price_usd_cents);}
   else {coins=boundedInt(b.customCoins,config.coinCustomMin,config.coinCustomMax);if(coins%100!==0)throw new HttpError(400,'VALIDATION_ERROR','Custom coin amounts must be in increments of 100');amountCents=Math.ceil(coins/100*config.coinPricePer100Usd*100);packageId=null;}
   if(!paypal.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','PayPal is not configured; no payment has been created');
   const amount=(amountCents/100).toFixed(2);const order=await paypal.request('/v2/checkout/orders',{method:'POST',requestId:idempotency,body:{intent:'CAPTURE',purchase_units:[{reference_id:packageId||'custom-coins',custom_id:user.id,description:`${coins} ZOVARA Coins`,amount:{currency_code:'USD',value:amount}}],application_context:{brand_name:'ZOVARA',landing_page:'LOGIN',user_action:'PAY_NOW',return_url:`${config.publicAppUrl.replace(/\/$/,'')}/?paypal=return`,cancel_url:`${config.publicAppUrl.replace(/\/$/,'')}/?paypal=cancel`}}});
   try{await insertOne('payment_orders',{user_id:user.id,package_id:packageId,coins,expected_amount_usd_cents:amountCents,paypal_order_id:order.id,status:'created',idempotency_key:idempotency},{token});}
   catch(e){log('error','paypal_order_not_persisted',{requestId,paypalOrderId:order.id});throw new HttpError(502,'PROVIDER_ERROR','PayPal order was created but could not be recorded locally; contact support before retrying');}
   const approval=Array.isArray(order.links)?order.links.find(l=>l.rel==='approve')?.href:null;if(!approval)throw new HttpError(502,'PROVIDER_ERROR','PayPal did not return an approval URL');
   return json(res,201,{data:{orderId:order.id,approvalUrl:approval,coins,amountUsd:amount,currency:'USD',status:order.status},error:null,meta:{requestId}});
 }
 const captureMatch=p.match(/^\/api\/v1\/payments\/orders\/([A-Z0-9-]+)\/capture$/i);
 if(captureMatch&&method==='POST'){
   const {user,token}=await auth(req);const orderId=captureMatch[1];const local=await selectOne('payment_orders',`paypal_order_id=eq.${encodeURIComponent(orderId)}&select=user_id,coins,expected_amount_usd_cents,status,provider_capture_id`,{token});if(!local||local.user_id!==user.id)throw new HttpError(404,'NOT_FOUND','Payment order not found for this account');if(local.status==='completed')return json(res,200,{data:{status:'completed',coins:local.coins,replayed:true},error:null,meta:{requestId}});
   const captured=await paypal.request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,{method:'POST',requestId:`zv-capture-${orderId}`});if(captured.status!=='COMPLETED')throw new HttpError(409,'CONFLICT',`PayPal capture is not complete (status: ${captured.status||'unknown'})`);
   const pu=captured.purchase_units?.[0];if(pu?.custom_id!==user.id)throw new HttpError(403,'FORBIDDEN','PayPal order owner does not match signed-in account');const cap=pu?.payments?.captures?.[0];if(!cap||cap.status!=='COMPLETED'||cap.amount?.currency_code!=='USD')throw new HttpError(409,'CONFLICT','PayPal did not confirm a completed USD capture');const cents=Math.round(Number(cap.amount.value)*100);if(!Number.isSafeInteger(cents)||cents!==Number(local.expected_amount_usd_cents))throw new HttpError(409,'CONFLICT','Captured amount does not match stored order');
   const result=await rpc('finalize_coin_purchase',{p_paypal_order_id:orderId,p_capture_id:cap.id,p_amount_usd_cents:cents},{token});return json(res,200,{data:result,error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/payments/webhooks/paypal'){
   const event=await bodyJson(req,2*1024*1024);const verified=await paypal.verifyWebhook(req.headers,event);if(!verified)throw new HttpError(400,'WEBHOOK_SIGNATURE_INVALID','PayPal webhook signature did not verify');
   const eventId=cleanText(event.id,180), eventType=cleanText(event.event_type,150);
   if(eventType==='PAYMENT.CAPTURE.COMPLETED'){
     const resource=event.resource||{};const orderId=resource.supplementary_data?.related_ids?.order_id;const captureId=resource.id;const currency=resource.amount?.currency_code;const cents=Math.round(Number(resource.amount?.value)*100);
     if(!orderId||!captureId||currency!=='USD'||!Number.isSafeInteger(cents))throw new HttpError(400,'VALIDATION_ERROR','Webhook does not contain a supported completed USD capture');
     const eventHash=createHash('sha256').update(JSON.stringify(event)).digest('hex');const result=await rpc('finalize_paypal_webhook',{p_paypal_order_id:orderId,p_capture_id:captureId,p_amount_usd_cents:cents,p_provider_event_id:eventId,p_event_hash:eventHash},{service:true});return json(res,200,{data:result,error:null,meta:{requestId}});
   }
   log('info','paypal_webhook_verified_unhandled',{eventType,eventId,requestId});return json(res,200,{data:{received:true,verified:true,processed:false,reason:'Event type is not handled by this release'},error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/payouts'){
   const {user}=await auth(req);if(!config.paypalPayoutsEnabled)throw new HttpError(503,'PAYOUTS_NOT_ENABLED','Creator payouts are disabled until PayPal account eligibility, payout approval, and reconciliation are verified. No payout was submitted.');
   if(!paypal.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','PayPal is not configured');const b=await bodyJson(req);const amountCents=boundedInt(b.amountUsdCents,1000,100000000);const email=cleanText(b.paypalEmail,254);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'VALIDATION_ERROR','Enter a valid PayPal payout email');
   const reservation=await rpc('request_creator_payout',{p_amount_usd_cents:amountCents,p_paypal_email:email},{token:bearer(req)});const payoutId=reservation.payoutRequestId;const senderBatchId=`zovara-${payoutId}`;
   try{const batch=await paypal.request('/v1/payments/payouts',{method:'POST',requestId:senderBatchId,body:{sender_batch_header:{sender_batch_id:senderBatchId,email_subject:'Your ZOVARA creator payout',email_message:'Your payout is being processed by PayPal.'},items:[{recipient_type:'EMAIL',amount:{value:(amountCents/100).toFixed(2),currency:'USD'},receiver:email,sender_item_id:String(payoutId),note:'ZOVARA creator earnings'}]}});
      const batchId=batch.batch_header?.payout_batch_id;await rpc('update_payout_provider_status',{p_payout_id:payoutId,p_provider_batch_id:batchId,p_status:'submitted',p_failure_reason:null},{service:true});return json(res,202,{data:{payoutRequestId:payoutId,providerBatchId:batchId,status:'submitted',amountUsd:(amountCents/100).toFixed(2),currency:'USD',message:'PayPal accepted the payout request. This is not confirmation that funds arrived.'},error:null,meta:{requestId}});
   }catch(e){await rpc('update_payout_provider_status',{p_payout_id:payoutId,p_provider_batch_id:null,p_status:'failed',p_failure_reason:cleanText(e.message,300)},{service:true}).catch(()=>{});throw e;}
 }
 if(method==='GET'&&p==='/api/v1/routes')return json(res,200,{data:{routes:['GET /healthz','GET /api/v1/health','GET /api/v1/client-config','GET /api/v1/features','GET /api/v1/catalog/gifts','GET /api/v1/catalog/gifter-levels','GET /api/v1/catalog/styles','GET /api/v1/catalog/icons','GET /api/v1/wallet/packages','GET /api/v1/live','GET /api/v1/search/profiles','GET/PATCH /api/v1/me','GET /api/v1/feed','GET /api/v1/posts/:id','POST /api/v1/posts/:id/like','DELETE /api/v1/posts/:id/like','GET/POST /api/v1/posts/:id/comments','POST /api/v1/posts/:id/save','POST /api/v1/reports','GET /api/v1/notifications','GET /api/v1/me/blocks','POST/DELETE /api/v1/profiles/:id/block','POST /api/v1/posts','POST /api/v1/media/upload-url','POST/DELETE /api/v1/profiles/:id/follow','POST /api/v1/lives','POST /api/v1/lives/:id/token','POST /api/v1/lives/:id/leave','POST /api/v1/lives/:id/end','POST /api/v1/lives/:id/guest-requests','POST /api/v1/lives/:id/guest-requests/:requestId/decision','GET/POST /api/v1/lives/:id/chat','GET/POST /api/v1/lives/:id/gifts','GET /api/v1/wallet','GET /api/v1/wallet/ledger','POST /api/v1/payments/orders','POST /api/v1/payments/orders/:id/capture','POST /api/v1/payments/webhooks/paypal','POST /api/v1/payouts']},error:null,meta:{requestId}});
 throw new HttpError(404,'NOT_FOUND','API route not found');
}

async function serveStatic(req,res,url,requestId){
 let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';
 const roots=[{prefix:'/assets/',root:path.join(ROOT,'assets')},{prefix:'/packages/design-system/',root:path.join(ROOT,'packages/design-system')},{prefix:'/apps/web/',root:WEB_ROOT}];
 let base=WEB_ROOT, rel=pathname.replace(/^\//,'');if(pathname==='/admin'||pathname==='/admin/') {base=path.join(ROOT,'apps/admin');rel='index.html';} else if(pathname==='/creator-studio'||pathname==='/creator-studio/') {base=path.join(ROOT,'apps/creator-studio');rel='index.html';} for(const r of roots){if(pathname.startsWith(r.prefix)){base=r.root;rel=pathname.slice(r.prefix.length);break;}}
 if(pathname.startsWith('/apps/web/'))rel=pathname.slice('/apps/web/'.length);
 if(pathname.startsWith('/assets/'))rel=pathname.slice('/assets/'.length);
 if(pathname.startsWith('/packages/design-system/'))rel=pathname.slice('/packages/design-system/'.length);
 if(pathname==='/index.html'||pathname==='/manifest.webmanifest'||pathname==='/sw.js'||pathname==='/src/app.js'||pathname==='/src/style.css')base=WEB_ROOT;
 const target=path.resolve(base,rel||'index.html');if(!target.startsWith(base+path.sep)&&target!==base)throw new HttpError(403,'FORBIDDEN','Invalid file path');
 try{const s=await stat(target);if(!s.isFile())throw new Error('not file');const ext=path.extname(target);const content=await readFile(target);res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(self), microphone=(self), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com"});res.end(content);return;
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(404,'NOT_FOUND','File not found');}
}
export function createServer(){return http.createServer(async(req,res)=>{
 const requestId=String(req.headers['x-request-id']||randomUUID()).slice(0,100);res.setHeader('X-Request-Id',requestId);
 const remote=req.socket.remoteAddress||'unknown';const now=Date.now();let item=rate.get(remote);if(!item||now-item.start>config.rateLimitWindowMs)item={start:now,count:0};item.count++;rate.set(remote,item);
 if(item.count>config.rateLimitMaxRequests){return json(res,429,{data:null,error:{code:'RATE_LIMITED',message:'Too many requests; retry later'},meta:{requestId}},{'Retry-After':'60'});}
 const origin=req.headers.origin;if(origin&&config.corsOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key, X-Request-Id');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');}
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 let url;try{url=new URL(req.url,'http://localhost');}catch{return errResponse(res,new HttpError(400,'VALIDATION_ERROR','Malformed request URL'),requestId);}
 try{
   if(req.method==='GET'&&url.pathname==='/healthz')return json(res,200,{status:'ok',service:'zovara-api',version:'0.1.0'});
   if(url.pathname.startsWith('/api/'))return await handleApi(req,res,url,requestId);
   if(!['GET','HEAD'].includes(req.method||''))throw new HttpError(405,'METHOD_NOT_ALLOWED','Method is not allowed for static resources');
   return await serveStatic(req,res,url,requestId);
 }catch(error){log((error.statusCode||500)>=500?'error':'warn','request_failed',{requestId,path:url.pathname,status:error.statusCode||500,code:error.code||'INTERNAL_ERROR',message:error.message});return errResponse(res,error,requestId);}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createServer();server.listen(config.port,'0.0.0.0',()=>log('info','server_started',{port:config.port,node:process.version,providers:apiFeatureList().providerStatus}));
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
}
