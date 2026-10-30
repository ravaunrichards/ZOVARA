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
function errResponse(res,error,requestId){
 const status=Number.isInteger(error.statusCode)?error.statusCode:500;
 const code=error.code||'INTERNAL_ERROR';
 const unauthenticated=status===401&&code==='UNAUTHENTICATED';
 const generic=status>=500||!(error instanceof HttpError);
 const publicCode=unauthenticated?'UNAUTHENTICATED':generic?'TEMPORARILY_UNAVAILABLE':code;
 const message=unauthenticated?'Sign in again to continue.':generic?'This feature is temporarily unavailable. Please try again later.':String(error.message||'Request failed');
 json(res,status,{data:null,error:{code:publicCode,message},meta:{requestId}});
}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):null;}
async function bodyJson(req,max=1024*1024){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>max)throw new HttpError(413,'PAYLOAD_TOO_LARGE','Request body is too large');chunks.push(chunk);}if(!chunks.length)return {};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'VALIDATION_ERROR','Request body must be valid JSON');}}
async function auth(req){return {user:await supabase.userFromToken(bearer(req)),token:bearer(req)};}
function requireUuid(value,label='id'){if(!isUuid(value))throw new HttpError(400,'VALIDATION_ERROR',`Invalid ${label}`);return value;}
async function rpc(name,body,{token,service=false}={}){return supabase.request(`/rest/v1/rpc/${name}`,{method:'POST',body,token,service});}
async function selectOne(table,query,{token,service=false}={}){const rows=await supabase.request(`/rest/v1/${table}?${query}`,{token,service});return Array.isArray(rows)?rows[0]||null:rows;}
async function insertOne(table,body,{token,service=false}={}){const rows=await supabase.request(`/rest/v1/${table}?select=*`,{method:'POST',body,token,service,headers:{Prefer:'return=representation'}});return Array.isArray(rows)?rows[0]||null:rows;}
async function patchRows(table,query,body,{token,service=false}={}){return supabase.request(`/rest/v1/${table}?${query}`,{method:'PATCH',body,token,service,headers:{Prefer:'return=representation'}});}
async function syncLiveRoomPresence(session, livekitPeople){
 if(!supabase.serviceConfigured())return new Map();
 const liveIds=[...new Set((livekitPeople||[]).map(person=>String(person.identity||'')).filter(id=>isUuid(id)&&id!==session.host_id))];
 const query=`/rest/v1/live_participants?live_session_id=eq.${session.id}&select=user_id,role,status,can_publish_audio,can_publish_video`;
 const rows=await supabase.request(query,{service:true});
 const byUser=new Map((rows||[]).map(row=>[row.user_id,row]));
 const liveSet=new Set(liveIds);
 for(const row of rows||[]){
  if(row.status==='joined'&&!liveSet.has(row.user_id)){
   await patchRows('live_participants',`live_session_id=eq.${session.id}&user_id=eq.${row.user_id}&status=eq.joined`,{status:'left',left_at:new Date().toISOString(),can_publish_audio:false,can_publish_video:false},{service:true});
  }
 }
 const roles=new Map();
 for(const userId of liveIds){
  const old=byUser.get(userId);
  if(old&&['removed','declined'].includes(old.status)){roles.set(userId,old.role);continue;}
  const privileged=!!old&&['guest','cohost','moderator'].includes(old.role)&&['invited','joined'].includes(old.status);
  const role=privileged?old.role:'viewer';
  roles.set(userId,role);
  if(!old||old.status!=='joined'){
   await supabase.request('/rest/v1/live_participants?on_conflict=live_session_id,user_id',{
    method:'POST',
    body:{live_session_id:session.id,user_id:userId,role,status:'joined',can_publish_audio:privileged&&!!old.can_publish_audio,can_publish_video:privileged&&!!old.can_publish_video,joined_at:new Date().toISOString(),left_at:null},
    service:true,
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'}
   });
  }
 }
 return roles;
}
function apiFeatureList(){return {version:'v1',providerStatus:{supabase:supabase.configured()?'configured':'not_configured',paypal:paypal.configured()?'configured':'not_configured',livekit:livekit.configured()?'configured':'not_configured',payoutsEnabled:config.paypalPayoutsEnabled},productStatus:'foundation-partial'};}
async function signedMediaUrl(bucket,objectPath,expiresIn=3600){
 if(!supabase.serviceConfigured())throw new HttpError(503,'CONFIGURATION_REQUIRED','Private media signing is not configured');
 const base=config.supabaseUrl.replace(/\/+$/,'');
 const encoded=String(objectPath).split('/').map(encodeURIComponent).join('/');
 const response=await fetch(base+'/storage/v1/object/sign/'+encodeURIComponent(bucket)+'/'+encoded,{method:'POST',headers:{apikey:config.supabaseServiceRoleKey,Authorization:'Bearer '+config.supabaseServiceRoleKey,'Content-Type':'application/json'},body:JSON.stringify({expiresIn}),signal:AbortSignal.timeout(15000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new HttpError(502,'MEDIA_SIGN_FAILED','The uploaded media could not be opened. Check the storage object and bucket permissions.');
 const signed=payload.signedURL||payload.signedUrl||payload.url;
 if(!signed)throw new HttpError(502,'MEDIA_SIGN_FAILED','Storage did not return a signed media URL');
 return signed.startsWith('http')?signed:base+'/storage/v1'+(signed.startsWith('/')?signed:'/'+signed);
}
async function enrichPostsWithMedia(rows,token){
 const posts=Array.isArray(rows)?rows:[];if(!posts.length)return posts;
 const ids=posts.map(x=>x.id).filter(Boolean);if(!ids.length)return posts;
 const links=await supabase.request('/rest/v1/post_media?post_id=in.('+ids.join(',')+')&select=post_id,media_id,position&order=position.asc',{token});
 const mediaIds=[...new Set((links||[]).map(x=>x.media_id))];if(!mediaIds.length)return posts.map(x=>({...x,media:[]}));
 const assets=await supabase.request('/rest/v1/media_assets?id=in.('+mediaIds.join(',')+')&select=id,storage_bucket,storage_path,media_type,mime_type,width,height,duration_ms,alt_text,processing_status',{token});
 const byId=new Map((assets||[]).map(x=>[x.id,x]));
 const signed=await Promise.all((assets||[]).map(async a=>{try{return [a.id,await signedMediaUrl(a.storage_bucket,a.storage_path)];}catch(e){log('warn','post_media_sign_failed',{mediaId:a.id,code:e.code||'MEDIA_SIGN_FAILED'});return [a.id,null];}}));
 const urls=new Map(signed),byPost=new Map();
 for(const link of links||[]){const a=byId.get(link.media_id);if(!a)continue;const item={id:a.id,type:a.media_type,mimeType:a.mime_type,url:urls.get(a.id)||null,width:a.width,height:a.height,durationMs:a.duration_ms,altText:a.alt_text||'',position:link.position};if(!byPost.has(link.post_id))byPost.set(link.post_id,[]);byPost.get(link.post_id).push(item);}
 return posts.map(x=>({...x,media:byPost.get(x.id)||[]}));
}
async function handleApi(req,res,url,requestId){
 const method=req.method||'GET', p=url.pathname;
 if(method==='GET'&&p==='/api/v1/health')return json(res,200,{data:{status:'ok',time:new Date().toISOString()},error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/client-config')return json(res,200,{data:{supabaseUrl:config.supabaseUrl||null,supabaseAnonKey:config.supabaseAnonKey||null},error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/features'){
   const {user,token}=await auth(req);
   const profile=await selectOne('profiles',`id=eq.${user.id}&select=role`,{token});
   if(profile?.role!=='admin')throw new HttpError(404,'NOT_FOUND','Resource not found');
   const inventory=JSON.parse(await readFile(featuresPath,'utf8'));
   return json(res,200,{data:inventory,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/catalog/gifts')return json(res,200,{data:JSON.parse(await readFile(giftsPath,'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/catalog/gifter-levels')return json(res,200,{data:JSON.parse(await readFile(levelsPath,'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/catalog/styles') {const reg=JSON.parse(await readFile(stylesPath,'utf8'));return json(res,200,{data:{version:reg.version,count:reg.count,combinationDimensions:reg.combinationDimensions},error:null,meta:{requestId}});}
 if(method==='GET'&&p==='/api/v1/catalog/icons')return json(res,200,{data:JSON.parse(await readFile(path.join(ROOT,'assets/icons/manifest.json'),'utf8')),error:null,meta:{requestId}});
 if(method==='GET'&&p==='/api/v1/wallet/packages'){
   const rows=await supabase.request('/rest/v1/coin_packages?select=id,name,coins,price_usd_cents&is_active=eq.true&is_custom=eq.false&order=sort_order.asc');
   return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/live'){
    const rows=await supabase.request('/rest/v1/live_sessions?select=id,host_id,title,visibility,room_name,started_at&status=eq.live&visibility=eq.public&order=started_at.desc&limit=30');
    const hostIds=[...new Set((rows||[]).map(x=>x.host_id))];
    const profiles=hostIds.length?await supabase.request('/rest/v1/profiles?select=id,handle,display_name,avatar_path&id=in.('+hostIds.join(',')+')'):[];
    const hostMap=new Map((profiles||[]).map(x=>[x.id,x]));
    const results=await Promise.all((rows||[]).map(async session=>{
      if(!livekit.configured()){
        // Do not advertise DB rows as live when the media service cannot verify them.
        return null;
      }
      try{
        const room=await livekit.listParticipants(session.room_name);
        const people=Array.isArray(room?.participants)?room.participants:[];
        // Require the actual host connection: a DB row alone is not a live broadcast.
        if(!people.some(person=>String(person.identity||'')===session.host_id))return null;
        let roleMap=new Map();
        try{roleMap=await syncLiveRoomPresence(session,people);}catch(error){log('warn','live_presence_sync_deferred',{sessionId:session.id,code:error.code||'SYNC_FAILED'});}
        const remotePeople=people.filter(person=>isUuid(String(person.identity||''))&&person.identity!==session.host_id);
        const viewerPeople=remotePeople.filter(person=>!['guest','cohost','moderator'].includes(roleMap.get(person.identity)||'viewer'));
        const ids=[...new Set(remotePeople.map(person=>person.identity))];
        const profilesForViewers=ids.length?await supabase.request('/rest/v1/profiles?select=id,handle,display_name&id=in.('+ids.join(',')+')'):[];
        const viewerMap=new Map((profilesForViewers||[]).map(profile=>[profile.id,profile]));
        const viewers=viewerPeople.map(person=>{
          const profile=viewerMap.get(person.identity)||{};
          const name=profile.display_name||String(person.name||'').replace(/\s*\(@[A-Za-z0-9_.-]+\)\s*$/,'').trim();
          const username=profile.handle||String(person.name||'').match(/@([A-Za-z0-9_.-]+)/)?.[1]||'';
          return name&&username?{name,username}:null;
        }).filter(Boolean);
        return {id:session.id,title:session.title,visibility:session.visibility,started_at:session.started_at,host:hostMap.get(session.host_id)||null,current_viewer_count:viewerPeople.length,viewer_count:viewerPeople.length,viewer_count_verified:true,viewers};
      }catch(error){
        if(error.providerStatus===404&&supabase.serviceConfigured()){
          await patchRows('live_sessions',`id=eq.${session.id}&status=eq.live`,{status:'ended',ended_at:new Date().toISOString(),current_viewer_count:0},{service:true}).catch(()=>{});
          return null;
        }
        log('warn','live_room_count_unavailable',{sessionId:session.id,code:error.code||'LIVEKIT_UNAVAILABLE'});
        // No media-service confirmation means the room is not shown as LIVE.
        return null;
      }
    }));
    return json(res,200,{data:results.filter(Boolean),error:null,meta:{requestId}});
  }
  if(method==='GET'&&p==='/api/v1/search/profiles'){
   const q=cleanText(url.searchParams.get('q')||'',40);if(q.length<2)return json(res,200,{data:[],error:null,meta:{requestId}});
   const encoded=encodeURIComponent(`*${q}*`);const rows=await supabase.request(`/rest/v1/profiles?select=id,handle,display_name,avatar_path,bio&deleted_at=is.null&or=(handle.ilike.${encoded},display_name.ilike.${encoded})&limit=20`);
   return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/me'){
   const {user,token}=await auth(req);
   const profile=await selectOne('profiles',`id=eq.${user.id}&select=id,handle,display_name,bio,avatar_path,cover_path,role,visibility,country_code,locale,timezone,is_verified,created_at`,{token});
   if(!profile)throw new HttpError(404,'PROFILE_NOT_FOUND','Your profile is not ready yet. Please refresh.');
   const stats=await rpc('get_profile_stats',{p_profile_id:user.id},{token});
   return json(res,200,{data:{user:{id:user.id,email:user.email},profile,stats},error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/me/settings'){
   const {user,token}=await auth(req);let settings=await selectOne('account_settings','user_id=eq.'+user.id+'&select=user_id,allow_messages_from,allow_calls_from,allow_group_invites,online_status_visible,read_receipts_enabled,push_enabled,quiet_hours,allow_voice_messages,allow_media_messages,typing_indicators_enabled,call_notifications_enabled',{token});
   if(!settings)settings=await insertOne('account_settings',{user_id:user.id},{token});
   return json(res,200,{data:settings,error:null,meta:{requestId}});
 }
 if(method==='PATCH'&&p==='/api/v1/me/settings'){
   const {user,token}=await auth(req);const b=await bodyJson(req);const fields={};
   for(const key of ['allow_messages_from','allow_calls_from','allow_group_invites'])if(b[key]!==undefined){if(!['everyone','followers','friends','nobody'].includes(b[key]))throw new HttpError(400,'VALIDATION_ERROR','Invalid account privacy option');fields[key]=b[key];}
   for(const key of ['online_status_visible','read_receipts_enabled','push_enabled','allow_voice_messages','allow_media_messages','typing_indicators_enabled','call_notifications_enabled'])if(b[key]!==undefined){if(typeof b[key]!=='boolean')throw new HttpError(400,'VALIDATION_ERROR','Account setting must be a boolean');fields[key]=b[key];}
   if(b.quiet_hours!==undefined){if(!b.quiet_hours||typeof b.quiet_hours!=='object'||Array.isArray(b.quiet_hours))throw new HttpError(400,'VALIDATION_ERROR','Quiet hours must be an object');fields.quiet_hours=b.quiet_hours;}
   if(!Object.keys(fields).length)throw new HttpError(400,'VALIDATION_ERROR','No account settings were provided');
   fields.user_id=user.id;fields.updated_at=new Date().toISOString();
   const rows=await supabase.request('/rest/v1/account_settings?on_conflict=user_id',{method:'POST',body:fields,token,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
   return json(res,200,{data:Array.isArray(rows)?rows[0]:rows,error:null,meta:{requestId}});
 }
 const publicProfileMatch=p.match(/^\/api\/v1\/profiles\/([a-z0-9_.-]+)$/i);
 if(method==='GET'&&publicProfileMatch){
   const handle=decodeURIComponent(publicProfileMatch[1]).toLowerCase();
   if(!isSafeHandle(handle))throw new HttpError(400,'VALIDATION_ERROR','Invalid username');
   const viewerToken=bearer(req);
   const viewer=viewerToken?await supabase.userFromToken(viewerToken):null;
   const profile=await selectOne('profiles',`handle=eq.${encodeURIComponent(handle)}&visibility=eq.public&deleted_at=is.null&select=id,handle,display_name,bio,avatar_path,cover_path,role,visibility,is_verified,created_at`,{token:viewerToken});
   if(!profile)throw new HttpError(404,'NOT_FOUND','This profile is not available.');
   if(viewer&&viewer.id!==profile.id)await rpc('record_profile_view',{p_profile_id:profile.id},{token:viewerToken});
   const stats=await rpc('get_profile_stats',{p_profile_id:profile.id},{token:viewerToken});
   const following=viewer&&viewer.id!==profile.id?await selectOne('follows',`follower_id=eq.${viewer.id}&followed_id=eq.${profile.id}&select=follower_id`,{token:viewerToken}):null;
   return json(res,200,{data:{profile,stats,isFollowing:!!following},error:null,meta:{requestId}});
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
 if(method==='POST'&&p==='/api/v1/conversations/direct'){
    const {token}=await auth(req);const b=await bodyJson(req);const other=requireUuid(b.userId,'recipient id');
    const result=await rpc('create_direct_conversation',{p_other_user_id:other},{token});
    return json(res,201,{data:{id:result.conversationId,kind:'direct'},error:null,meta:{requestId}});
  }
  if(method==='POST'&&p==='/api/v1/conversations'){const {token}=await auth(req);const b=await bodyJson(req);const memberIds=Array.isArray(b.memberIds)?b.memberIds.slice(0,50).map(x=>requireUuid(x,'member id')):[];const title=cleanText(b.title,80);const result=await rpc('create_group_conversation',{p_title:title,p_member_ids:memberIds},{token});return json(res,201,{data:{id:result.conversationId,kind:'group',title:title||null},error:null,meta:{requestId}});}
  if(method==='GET'&&p==='/api/v1/conversations'){
    const {user,token}=await auth(req);
    const memberships=await supabase.request('/rest/v1/conversation_members?user_id=eq.'+user.id+'&select=conversation_id&order=joined_at.desc&limit=100',{token});
    const ids=[...new Set((memberships||[]).map(x=>x.conversation_id))];
    if(!ids.length)return json(res,200,{data:[],error:null,meta:{requestId}});
    const idList=ids.join(',');
    const [conversations,members,messages]=await Promise.all([
      supabase.request('/rest/v1/conversations?select=id,kind,title,created_at&id=in.('+idList+')',{token}),
      supabase.request('/rest/v1/conversation_members?select=conversation_id,user_id,role&conversation_id=in.('+idList+')&limit=800',{token}),
      supabase.request('/rest/v1/messages?select=id,conversation_id,sender_id,body,kind,created_at&deleted_at=is.null&conversation_id=in.('+idList+')&order=created_at.desc&limit=200',{token})
    ]);
    const otherIds=[...new Set((members||[]).map(x=>x.user_id).filter(id=>id!==user.id))];
    const profiles=otherIds.length?await supabase.request('/rest/v1/profiles?select=id,handle,display_name,avatar_path&id=in.('+otherIds.join(',')+')',{token}):[];
    const profileMap=new Map((profiles||[]).map(x=>[x.id,x]));
    const latest=new Map();for(const message of messages||[])if(!latest.has(message.conversation_id))latest.set(message.conversation_id,message);
    const peers=new Map();for(const member of members||[])if(member.user_id!==user.id){if(!peers.has(member.conversation_id))peers.set(member.conversation_id,[]);peers.get(member.conversation_id).push(profileMap.get(member.user_id)||{display_name:'ZOVARA member'});}
    const preferences=await supabase.request('/rest/v1/conversation_preferences?user_id=eq.'+user.id+'&conversation_id=in.('+idList+')&select=conversation_id,is_pinned,is_archived,is_muted',{token});
    const preferenceMap=new Map((preferences||[]).map(x=>[x.conversation_id,x]));
    const data=(conversations||[]).map(conversation=>{const message=latest.get(conversation.id);return {id:conversation.id,kind:conversation.kind,title:conversation.title,createdAt:conversation.created_at,peer:peers.get(conversation.id)?.[0]||null,lastMessage:message?{body:message.body,kind:message.kind,createdAt:message.created_at,mine:message.sender_id===user.id}:null,preferences:preferenceMap.get(conversation.id)||{is_pinned:false,is_archived:false,is_muted:false}};}).filter(x=>!x.preferences.is_archived).sort((a,b)=>Number(b.preferences.is_pinned)-Number(a.preferences.is_pinned)||new Date(b.lastMessage?.createdAt||b.createdAt)-new Date(a.lastMessage?.createdAt||a.createdAt));
    return json(res,200,{data,error:null,meta:{requestId}});
  }
  const conversationMessagesMatch=p.match(/^\/api\/v1\/conversations\/([0-9a-f-]+)\/messages$/i);
  if(conversationMessagesMatch&&(method==='GET'||method==='POST')){
    const {user,token}=await auth(req);const conversationId=requireUuid(conversationMessagesMatch[1],'conversation id');
    if(method==='POST'){
      const b=await bodyJson(req);const body=cleanText(b.body,8000);const kind=b.kind||'text';
      const clientMessageId=cleanText(req.headers['idempotency-key']||b.clientMessageId||randomUUID(),120);
      const result=await rpc('send_conversation_message',{p_conversation_id:conversationId,p_body:body,p_kind:kind,p_media_id:b.mediaId||null,p_reply_to:b.replyTo||null,p_client_message_id:clientMessageId},{token});
      return json(res,201,{data:result,error:null,meta:{requestId}});
    }
    const rows=await supabase.request('/rest/v1/messages?conversation_id=eq.'+conversationId+'&deleted_at=is.null&select=id,conversation_id,sender_id,body,kind,media_id,reply_to,created_at,client_message_id&order=created_at.asc&limit=100',{token});
    const senderIds=[...new Set((rows||[]).map(x=>x.sender_id))];const messageIds=(rows||[]).map(x=>x.id);
    const [profiles,reactions,receipts]=await Promise.all([
      senderIds.length?supabase.request('/rest/v1/profiles?select=id,handle,display_name,avatar_path&id=in.('+senderIds.join(',')+')',{token}):[],
      messageIds.length?supabase.request('/rest/v1/message_reactions?select=message_id,user_id,emoji&message_id=in.('+messageIds.join(',')+')',{token}):[],
      messageIds.length?supabase.request('/rest/v1/message_receipts?select=message_id,user_id,delivered_at,read_at&message_id=in.('+messageIds.join(',')+')',{token}):[]
    ]);
    const profileMap=new Map((profiles||[]).map(x=>[x.id,x]));const reactionMap=new Map();for(const x of reactions||[]){if(!reactionMap.has(x.message_id))reactionMap.set(x.message_id,[]);reactionMap.get(x.message_id).push({emoji:x.emoji,userId:x.user_id,mine:x.user_id===user.id});}
    const receiptMap=new Map();for(const x of receipts||[]){if(!receiptMap.has(x.message_id))receiptMap.set(x.message_id,[]);receiptMap.get(x.message_id).push({userId:x.user_id,deliveredAt:x.delivered_at,readAt:x.read_at});}
    await rpc('mark_conversation_read',{p_conversation_id:conversationId},{token});
    return json(res,200,{data:(rows||[]).map(x=>({...x,mine:x.sender_id===user.id,sender:profileMap.get(x.sender_id)||{display_name:'ZOVARA member'},reactions:reactionMap.get(x.id)||[],receipts:receiptMap.get(x.id)||[]})),error:null,meta:{requestId}});
  }
  const conversationPreferenceMatch=p.match(/^\/api\/v1\/conversations\/([0-9a-f-]+)\/preferences$/i);
  if(conversationPreferenceMatch&&method==='PATCH'){const {user,token}=await auth(req);const cid=requireUuid(conversationPreferenceMatch[1],'conversation id');const b=await bodyJson(req);const fields={};for(const k of ['is_pinned','is_archived','is_muted'])if(b[k]!==undefined)fields[k]=!!b[k];if(!Object.keys(fields).length)throw new HttpError(400,'VALIDATION_ERROR','No conversation preference was supplied');const rows=await supabase.request('/rest/v1/conversation_preferences?on_conflict=conversation_id,user_id',{method:'POST',body:{conversation_id:cid,user_id:user.id,...fields},token,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});return json(res,200,{data:Array.isArray(rows)?rows[0]:rows,error:null,meta:{requestId}});}
  const conversationHistoryMatch=p.match(/^\\/api\\/v1\\/conversations\\/([0-9a-f-]+)\\/calls$/i);
  if(conversationHistoryMatch&&method==='GET'){
    const {token}=await auth(req);const conversationId=requireUuid(conversationHistoryMatch[1],'conversation id');
    const calls=await supabase.request('/rest/v1/call_sessions?conversation_id=eq.'+conversationId+'&select=id,created_by,call_type,status,started_at,ended_at,created_at,ended_reason,duration_seconds&order=created_at.desc&limit=50',{token});
    return json(res,200,{data:calls,error:null,meta:{requestId}});
  }
  const conversationCallMatch=p.match(/^\/api\/v1\/conversations\/([0-9a-f-]+)\/calls$/i);
  if(conversationCallMatch&&method==='POST'){
    const {user,token}=await auth(req);const conversationId=requireUuid(conversationCallMatch[1],'conversation id');const b=await bodyJson(req);
    if(!livekit.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','Calling is not available yet');
    const callType=b.callType==='audio'?'audio':'video';
    const created=await rpc('start_conversation_call',{p_conversation_id:conversationId,p_call_type:callType},{token});
    const call=await selectOne('call_sessions','id=eq.'+created.callId+'&select=id,room_name,call_type,status',{token});
    if(!call)throw new HttpError(503,'CALL_SETUP_FAILED','Call setup could not be verified');
    try{await livekit.createRoom(call.room_name,8);}catch(error){await rpc('update_conversation_call',{p_call_id:call.id,p_action:'end'},{token}).catch(()=>{});throw new HttpError(502,'CALL_MEDIA_UNAVAILABLE','Call media could not be started');}
    const participantToken=livekit.createParticipantToken({identity:user.id,room:call.room_name,canPublish:true,canSubscribe:true,canPublishData:true});
    return json(res,201,{data:{callId:call.id,callType:call.call_type,serverUrl:config.livekitUrl,token:participantToken},error:null,meta:{requestId}});
  }
  if(method==='GET'&&p==='/api/v1/calls/incoming'){
    const {user,token}=await auth(req);
    if(livekit.configured()){
      try{const expired=await rpc('expire_stale_conversation_calls',{}, {service:true});for(const item of expired||[])if(item.room_name)await livekit.deleteRoom(item.room_name).catch(()=>{});}
      catch(error){log('warn','call_expiry_cleanup_failed',{code:error.code||'CALL_EXPIRY_CLEANUP_FAILED'});}
    }
    const invites=await supabase.request('/rest/v1/call_participants?user_id=eq.'+user.id+'&status=eq.ringing&select=call_id,invited_at&order=invited_at.desc&limit=10',{token});
    const ids=[...new Set((invites||[]).map(x=>x.call_id))];
    if(!ids.length)return json(res,200,{data:[],error:null,meta:{requestId}});
    const calls=await supabase.request('/rest/v1/call_sessions?select=id,conversation_id,created_by,call_type,created_at&id=in.('+ids.join(',')+')',{token});
    const callerIds=[...new Set((calls||[]).map(x=>x.created_by))];
    const profiles=callerIds.length?await supabase.request('/rest/v1/profiles?select=id,handle,display_name&id=in.('+callerIds.join(',')+')',{token}):[];
    const profileMap=new Map((profiles||[]).map(x=>[x.id,x]));
    return json(res,200,{data:(calls||[]).map(c=>({id:c.id,conversationId:c.conversation_id,callType:c.call_type,createdAt:c.created_at,caller:profileMap.get(c.created_by)||{display_name:'ZOVARA member'}})),error:null,meta:{requestId}});
  }
  const callDecisionMatch=p.match(/^\/api\/v1\/calls\/([0-9a-f-]+)\/decision$/i);
  if(callDecisionMatch&&method==='POST'){
    const {user,token}=await auth(req);const callId=requireUuid(callDecisionMatch[1],'call id');const b=await bodyJson(req);const action=b.action;
    if(action==='accept'&&!livekit.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','Calling is not available yet');
    const call=await selectOne('call_sessions','id=eq.'+callId+'&select=id,room_name,call_type,status',{token});
    if(!call)throw new HttpError(404,'NOT_FOUND','Call not found');
    const result=await rpc('update_conversation_call',{p_call_id:callId,p_action:action},{token});
    if(action==='accept'){
      const participant=await selectOne('call_participants','call_id=eq.'+callId+'&user_id=eq.'+user.id+'&select=status',{token});
      if(participant?.status!=='accepted')throw new HttpError(403,'FORBIDDEN','Call invitation is no longer available');
      const participantToken=livekit.createParticipantToken({identity:user.id,room:call.room_name,canPublish:true,canSubscribe:true,canPublishData:true});
      return json(res,200,{data:{...result,callId,callType:call.call_type,serverUrl:config.livekitUrl,token:participantToken},error:null,meta:{requestId}});
    }
    if(['ended','missed'].includes(result.status)&&livekit.configured())await livekit.deleteRoom(call.room_name).catch(()=>{});
    return json(res,200,{data:result,error:null,meta:{requestId}});
  }
  if(method==='GET'&&p==='/api/v1/feed'){
   const mode=url.searchParams.get('mode')||'for-you';let token=bearer(req),user=null,filters=[];
   if(url.searchParams.has('authorId')){const target=requireUuid(url.searchParams.get('authorId'),'author id');if(token)user=await supabase.userFromToken(token);filters.push(`author_id=eq.${target}`);}
   else if(mode==='following'){if(!token)throw new HttpError(401,'UNAUTHENTICATED','Sign in to load the Following feed');user=await supabase.userFromToken(token);const edges=await supabase.request(`/rest/v1/follows?follower_id=eq.${user.id}&select=followed_id&limit=1000`,{token});const ids=(edges||[]).map(x=>x.followed_id);if(!ids.length)return json(res,200,{data:[],error:null,meta:{requestId}});filters.push(`author_id=in.(${ids.join(',')})`);}
   else if(token)user=await supabase.userFromToken(token);
   filters.push('status=eq.published','deleted_at=is.null');if(!url.searchParams.has('authorId')&&mode!=='following')filters.push('visibility=eq.public');
   const query=`select=id,author_id,body,hashtags,visibility,status,creation_options,cover_media_id,published_at,created_at&${filters.join('&')}&order=published_at.desc.nullslast&limit=30`;
   const rows=await supabase.request(`/rest/v1/posts?${query}`,{token});const ids=[...new Set((rows||[]).map(x=>x.author_id))];let profiles=[],likes=[],liked=[];
   if(ids.length){const inList=ids.join(',');profiles=await supabase.request(`/rest/v1/profiles?select=id,handle,display_name,avatar_path,bio&id=in.(${inList})`,{token});}
   const postIds=[...new Set((rows||[]).map(x=>x.id))];if(postIds.length){const q=`/rest/v1/post_likes?select=post_id&post_id=in.(${postIds.join(',')})`;likes=await supabase.request(q,{token});if(user)liked=await supabase.request(`/rest/v1/post_likes?select=post_id&user_id=eq.${user.id}&post_id=in.(${postIds.join(',')})`,{token});}
    const byId=new Map((profiles||[]).map(x=>[x.id,x]));const counts=new Map();for(const x of likes||[])counts.set(x.post_id,(counts.get(x.post_id)||0)+1);const likedSet=new Set((liked||[]).map(x=>x.post_id));const enriched=await enrichPostsWithMedia((rows||[]).map(r=>({...r,author:byId.get(r.author_id)||null,likeCount:counts.get(r.id)||0,likedByMe:likedSet.has(r.id)})),token);return json(res,200,{data:enriched,error:null,meta:{requestId}});
 }
 const postMatch=p.match(/^\/api\/v1\/posts\/([0-9a-f-]+)$/i);
 if(postMatch&&method==='GET'){
   const postId=requireUuid(postMatch[1],'post id');const token=bearer(req);const viewer=token?await supabase.userFromToken(token):null;const row=await selectOne('posts',`id=eq.${postId}&select=id,author_id,body,hashtags,visibility,status,creation_options,cover_media_id,deleted_at,comments_enabled,like_count,published_at,created_at`,{token});if(!row||row.status!=='published'||row.deleted_at)throw new HttpError(404,'NOT_FOUND','Post not found');
   let permitted=row.visibility==='public'||row.author_id===viewer?.id;
   if(!permitted&&viewer&&row.visibility==='followers'){const edge=await selectOne('follows',`follower_id=eq.${viewer.id}&followed_id=eq.${row.author_id}&select=follower_id`,{token});permitted=!!edge;}
   if(!permitted&&viewer&&row.visibility==='friends'){const friendship=await supabase.request(`/rest/v1/friendships?or=(and(requester_id.eq.${viewer.id},addressee_id.eq.${row.author_id}),and(requester_id.eq.${row.author_id},addressee_id.eq.${viewer.id}))&status=eq.accepted&select=id&limit=1`,{token});permitted=Array.isArray(friendship)&&friendship.length>0;}
   if(!permitted)throw new HttpError(404,'NOT_FOUND','Post not found');const author=await selectOne('profiles',`id=eq.${row.author_id}&select=id,handle,display_name,avatar_path,bio`,{token});let likeCount=Number(row.like_count)||0,likedByMe=false;if(viewer){const mine=await selectOne('post_likes',`post_id=eq.${postId}&user_id=eq.${viewer.id}&select=post_id`,{token});likedByMe=!!mine;}const [enriched]=await enrichPostsWithMedia([{...row,author,likeCount,likedByMe}],token);return json(res,200,{data:enriched,error:null,meta:{requestId}});
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
  const messageMutationMatch=p.match(/^\/api\/v1\/messages\/([0-9a-f-]+)$/i);
 if(messageMutationMatch&&(method==='PATCH'||method==='DELETE')){const {token}=await auth(req);const mid=requireUuid(messageMutationMatch[1],'message id');const result=method==='PATCH'?await rpc('edit_conversation_message',{p_message_id:mid,p_body:cleanText((await bodyJson(req)).body,8000)},{token}):await rpc('delete_conversation_message',{p_message_id:mid},{token});return json(res,200,{data:result,error:null,meta:{requestId}});}
  const reactionMatch=p.match(/^\/api\/v1\/messages\/([0-9a-f-]+)\/reactions$/i);
 if(reactionMatch&&(method==='POST'||method==='DELETE')){const {user,token}=await auth(req);const mid=requireUuid(reactionMatch[1],'message id');const b=method==='POST'?await bodyJson(req):{};const emoji=cleanText(b.emoji,8);const allowed=['❤️','😂','😮','😢','🙏','🔥','👏','👍','👎','💯'];if(method==='POST'&&!allowed.includes(emoji))throw new HttpError(400,'VALIDATION_ERROR','Unsupported message reaction');if(method==='POST')await insertOne('message_reactions',{message_id:mid,user_id:user.id,emoji},{token}).catch(e=>{if(!String(e.message).toLowerCase().includes('duplicate')&&!String(e.message).toLowerCase().includes('unique'))throw e;});else await supabase.request('/rest/v1/message_reactions?message_id=eq.'+mid+'&user_id=eq.'+user.id+'&emoji=eq.'+encodeURIComponent(emoji),{method:'DELETE',token});return json(res,200,{data:{messageId:mid,emoji,active:method==='POST'},error:null,meta:{requestId}});}
 if(method==='GET'&&p==='/api/v1/drafts'){const {user,token}=await auth(req);const rows=await supabase.request('/rest/v1/content_drafts?author_id=eq.'+user.id+'&select=id,caption,hashtags,visibility,media_ids,cover_media_id,comments_enabled,draft_metadata,created_at,updated_at&order=updated_at.desc&limit=50',{token});return json(res,200,{data:rows,error:null,meta:{requestId}});}
 if(method==='POST'&&p==='/api/v1/drafts'){const {user,token}=await auth(req);const b=await bodyJson(req);const row=await insertOne('content_drafts',{author_id:user.id,caption:cleanText(b.caption,4000),hashtags:Array.isArray(b.hashtags)?b.hashtags.slice(0,30).map(x=>cleanText(x,60).replace(/^#/,'')).filter(Boolean):[],visibility:['public','followers','friends','private','subscriber'].includes(b.visibility)?b.visibility:'public',media_ids:Array.isArray(b.mediaIds)?b.mediaIds.slice(0,10).filter(isUuid):[],cover_media_id:b.coverMediaId&&isUuid(b.coverMediaId)?b.coverMediaId:null,comments_enabled:b.commentsEnabled!==false,draft_metadata:b.metadata&&typeof b.metadata==='object'?b.metadata:{}},{token});return json(res,201,{data:row,error:null,meta:{requestId}});}
  const draftMatch=p.match(/^\/api\/v1\/drafts\/([0-9a-f-]+)$/i);
 if(draftMatch&&(method==='PATCH'||method==='DELETE')){const {user,token}=await auth(req);const did=requireUuid(draftMatch[1],'draft id');if(method==='DELETE'){await supabase.request('/rest/v1/content_drafts?id=eq.'+did+'&author_id=eq.'+user.id,{method:'DELETE',token});return json(res,200,{data:{id:did,deleted:true},error:null,meta:{requestId}});}const b=await bodyJson(req),fields={updated_at:new Date().toISOString()};if(b.caption!==undefined)fields.caption=cleanText(b.caption,4000);if(b.visibility!==undefined){if(!['public','followers','friends','private','subscriber'].includes(b.visibility))throw new HttpError(400,'VALIDATION_ERROR','Invalid audience');fields.visibility=b.visibility;}if(b.mediaIds!==undefined)fields.media_ids=Array.isArray(b.mediaIds)?b.mediaIds.slice(0,10).filter(isUuid):[];if(b.hashtags!==undefined)fields.hashtags=Array.isArray(b.hashtags)?b.hashtags.slice(0,30).map(x=>cleanText(x,60).replace(/^#/,'')).filter(Boolean):[];if(b.metadata!==undefined){if(!b.metadata||typeof b.metadata!=='object'||Array.isArray(b.metadata))throw new HttpError(400,'VALIDATION_ERROR','Draft metadata must be an object');fields.draft_metadata=b.metadata;}if(b.commentsEnabled!==undefined)fields.comments_enabled=!!b.commentsEnabled;if(b.coverMediaId!==undefined)fields.cover_media_id=b.coverMediaId&&isUuid(b.coverMediaId)?b.coverMediaId:null;const rows=await patchRows('content_drafts','id=eq.'+did+'&author_id=eq.'+user.id,fields,{token});return json(res,200,{data:Array.isArray(rows)?rows[0]:rows,error:null,meta:{requestId}});}
 if(method==='POST'&&p==='/api/v1/posts'){
   const {token}=await auth(req);const b=await bodyJson(req);const body=cleanText(b.body,4000);const visibility=b.visibility||'public';
   if(!['public','followers','friends','private','subscriber'].includes(visibility))throw new HttpError(400,'VALIDATION_ERROR','Invalid audience');
   const mediaIds=Array.isArray(b.mediaIds)?b.mediaIds.slice(0,10).map(id=>requireUuid(id,'media id')):[];
   const hashtags=Array.isArray(b.hashtags)?b.hashtags.slice(0,30).map(x=>cleanText(x,60).replace(/^#/,'')).filter(Boolean):[];
   const row=await rpc('create_post_with_media',{p_body:body,p_visibility:visibility,p_media_ids:mediaIds,p_hashtags:hashtags,p_comments_enabled:b.commentsEnabled!==false,p_options:b.creationOptions&&typeof b.creationOptions==='object'?b.creationOptions:{}},{token});
   return json(res,201,{data:row,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/media/view-url'){
   const token=bearer(req);const mediaId=url.searchParams.get('id');const objectPath=cleanText(url.searchParams.get('path')||'',500);let asset=null;
   if(mediaId){if(!isUuid(mediaId))throw new HttpError(400,'VALIDATION_ERROR','Invalid media identifier');asset=await selectOne('media_assets','id=eq.'+mediaId+'&select=id,owner_id,storage_bucket,storage_path,mime_type,media_type',{token});if(!asset)throw new HttpError(404,'NOT_FOUND','Media is not available to this account');}
   else{const {user}=await auth(req);const parts=objectPath.split('/');if(parts.length<2||parts[0]!==user.id||parts.some(x=>x==='.'||x==='..'))throw new HttpError(403,'FORBIDDEN','Media path must belong to the signed-in account');asset={storage_bucket:config.mediaBucket,storage_path:objectPath};}
   const signedUrl=await signedMediaUrl(asset.storage_bucket,asset.storage_path);return json(res,200,{data:{url:signedUrl,expiresIn:3600,mimeType:asset.mime_type||null,mediaType:asset.media_type||null},error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/media/complete'){
   const {user,token}=await auth(req);const b=await bodyJson(req);const objectPath=cleanText(b.path,500);const parts=objectPath.split('/');
   if(parts.length<2||parts[0]!==user.id||parts.some(x=>!x||x==='.'||x==='..'))throw new HttpError(403,'FORBIDDEN','Upload path must belong to the signed-in account');
   const mime=cleanText(b.mimeType,100);const size=Number(b.size);const mediaType=mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':mime.startsWith('image/')?'image':null;
   if(!mediaType||!Number.isSafeInteger(size)||size<1||size>config.maxUploadBytes)throw new HttpError(400,'VALIDATION_ERROR','Uploaded media type or size is invalid');
   await signedMediaUrl(config.mediaBucket,objectPath,60);
   const existing=await selectOne('media_assets','storage_path=eq.'+encodeURIComponent(objectPath)+'&select=id,owner_id,media_type,mime_type,byte_size,processing_status',{token});
   if(existing){if(existing.owner_id!==user.id)throw new HttpError(403,'FORBIDDEN','Upload does not belong to this account');return json(res,200,{data:existing,error:null,meta:{requestId}});}
   const row=await insertOne('media_assets',{owner_id:user.id,storage_bucket:config.mediaBucket,storage_path:objectPath,media_type:mediaType,mime_type:mime,byte_size:size,width:Number.isInteger(b.width)?b.width:null,height:Number.isInteger(b.height)?b.height:null,duration_ms:Number.isInteger(b.durationMs)?b.durationMs:null,alt_text:cleanText(b.altText,300),metadata:b.metadata&&typeof b.metadata==='object'?b.metadata:{}},{token});
   return json(res,201,{data:row,error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/media/upload-url'){
   const {user}=await auth(req);const b=await bodyJson(req);const filename=cleanText(b.filename,120).replace(/[^a-zA-Z0-9_.-]/g,'_');const mime=cleanText(b.mimeType,100);const size=Number(b.size);
    if(!filename||!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/mpeg','audio/mp4','audio/ogg'].includes(mime)||!Number.isSafeInteger(size)||size<1||size>config.maxUploadBytes)throw new HttpError(400,'VALIDATION_ERROR','Filename, supported media MIME type, or file size is invalid');
   const objectPath=`${user.id}/${randomUUID()}-${filename}`;const encoded=objectPath.split('/').map(encodeURIComponent).join('/');
   const base=config.supabaseUrl.replace(/\/+$/,'');
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
    if(!livekit.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','Livestreaming is not available yet');
    const b=await bodyJson(req);const title=cleanText(b.title||'Live on ZOVARA',120);const visibility=b.visibility||'public';
    if(!['public','private','followers','subscribers','age_restricted'].includes(visibility))throw new HttpError(400,'VALIDATION_ERROR','Invalid live visibility');
    if(['subscribers','age_restricted'].includes(visibility))throw new HttpError(403,'FEATURE_UNAVAILABLE','This audience restriction is not available until its eligibility checks are enabled');
    const id=randomUUID(),roomName='zovara-'+id;
    const session=await insertOne('live_sessions',{id,host_id:user.id,title,visibility,status:'scheduled',room_name:roomName},{token});
    let roomCreated=false;
    try{
      await livekit.createRoom(roomName,config.livekitDefaultRoomMaxParticipants||100);roomCreated=true;
      const startedAt=new Date().toISOString();
      const rows=await patchRows('live_sessions','id=eq.'+id+'&host_id=eq.'+user.id,{status:'live',started_at:startedAt},{token});
      if(!Array.isArray(rows)||!rows.length)throw new HttpError(403,'FORBIDDEN','Live session could not be activated for this account');
      const profile=await selectOne('profiles',`id=eq.${user.id}&select=handle,display_name`,{token});
      const participantName=cleanText(`${profile?.display_name||profile?.handle||'ZOVARA creator'}${profile?.handle?` (@${profile.handle})`:''}`,80);
      const participantToken=livekit.createParticipantToken({identity:user.id,name:participantName,room:roomName,canPublish:true,canSubscribe:true,canPublishData:true});
      return json(res,201,{data:{id:session.id,title:session.title,status:'live',serverUrl:config.livekitUrl,participantToken,host:true},error:null,meta:{requestId}});
    }catch(error){
      if(roomCreated)await livekit.deleteRoom(roomName).catch(()=>{});
      await patchRows('live_sessions','id=eq.'+id+'&host_id=eq.'+user.id,{status:'failed',ended_at:new Date().toISOString()},{token}).catch(()=>{});
      throw error;
    }
  }
  const liveTokenMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/token$/i);
  if(liveTokenMatch&&method==='POST'){
    const {user,token}=await auth(req);const liveId=requireUuid(liveTokenMatch[1],'live session id');
    if(!livekit.configured())throw new HttpError(503,'CONFIGURATION_REQUIRED','Livestreaming is not available yet');
    const live=await selectOne('live_sessions','id=eq.'+liveId+'&select=id,host_id,room_name,status,title',{token});
    if(!live||live.status!=='live')throw new HttpError(404,'NOT_FOUND','Live session is not active');
    const isHost=live.host_id===user.id;
    const authorization=isHost?{canPublishAudio:true,canPublishVideo:true,role:'host'}:await rpc('join_live_session',{p_live_session_id:liveId},{token});
    const profile=await selectOne('profiles',`id=eq.${user.id}&select=handle,display_name`,{token});
    const participantName=cleanText(`${profile?.display_name||profile?.handle||'ZOVARA creator'}${profile?.handle?` (@${profile.handle})`:''}`,80);
    const participantToken=livekit.createParticipantToken({identity:user.id,name:participantName,room:live.room_name,canPublish:isHost||!!(authorization.canPublishAudio&&authorization.canPublishVideo),canSubscribe:true,canPublishData:true});
    return json(res,200,{data:{token:participantToken,serverUrl:config.livekitUrl,host:isHost,role:authorization.role|| (isHost?'host':'viewer')},error:null,meta:{requestId}});
  }
  const liveLeaveMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/leave$/i);
  if(liveLeaveMatch&&method==='POST'){
    const {token}=await auth(req);const liveId=requireUuid(liveLeaveMatch[1],'live session id');
    const result=await rpc('leave_live_session',{p_live_session_id:liveId},{token});
    return json(res,200,{data:result,error:null,meta:{requestId}});
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
    const {token}=await auth(req);const requestIdParam=requireUuid(guestDecisionMatch[2],'guest request id');const b=await bodyJson(req);
    if(!['accepted','rejected'].includes(b.decision))throw new HttpError(400,'VALIDATION_ERROR','Decision must be accepted or rejected');
    const result=await rpc('resolve_live_guest_request',{p_request_id:requestIdParam,p_decision:b.decision},{token});
    return json(res,200,{data:result,error:null,meta:{requestId}});
  }
  const liveEndMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/end$/i);
  if(liveEndMatch&&method==='POST'){
    const {token}=await auth(req);const liveId=requireUuid(liveEndMatch[1],'live session id');
    const live=await selectOne('live_sessions','id=eq.'+liveId+'&select=id,room_name,status',{token});
    if(!live)throw new HttpError(404,'NOT_FOUND','Live session not found');
    const result=await rpc('end_live_session',{p_live_session_id:liveId},{token});
    if(livekit.configured())await livekit.deleteRoom(live.room_name).catch(error=>log('warn','live_room_cleanup_failed',{requestId,liveId,code:error.code||'LIVEKIT_ERROR'}));
    return json(res,200,{data:result,error:null,meta:{requestId}});
  }
  const guestMatch=p.match(/^\/api\/v1\/lives\/([0-9a-f-]+)\/guest-requests$/i);
 if(guestMatch&&method==='POST'){
   const {user,token}=await auth(req);const liveId=requireUuid(guestMatch[1],'live session id');const b=await bodyJson(req);const requestedRole=['guest','cohost'].includes(b.role)?b.role:'guest';
   const live=await selectOne('live_sessions',`id=eq.${liveId}&select=id,status,host_id`,{token});if(!live||live.status!=='live')throw new HttpError(404,'NOT_FOUND','Live session is not active');
   const result=await insertOne('live_guest_requests',{live_session_id:liveId,requester_id:user.id,requested_role:requestedRole,status:'pending'},{token});return json(res,201,{data:result,error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/wallet'){
   const {user,token}=await auth(req);const wallet=await selectOne('wallets',`user_id=eq.${user.id}&select=user_id,coin_balance,locked_coins,updated_at`,{token});if(!wallet)throw new HttpError(503,'ACCOUNT_SETUP_PENDING','Your wallet is being prepared. Please refresh shortly.');const earnings=await selectOne('creator_earnings',`creator_id=eq.${user.id}&select=pending_usd_cents,available_usd_cents,paid_usd_cents`,{token});const gifter=await selectOne('gifter_profiles',`user_id=eq.${user.id}&select=eligible_coins_spent,level,updated_at`,{token});
   return json(res,200,{data:{coins:wallet.coin_balance,lockedCoins:wallet.locked_coins,earnings:{pendingUsdCents:earnings?.pending_usd_cents||0,availableUsdCents:earnings?.available_usd_cents||0,paidUsdCents:earnings?.paid_usd_cents||0},gifterLevel:gifter?.level||0,eligibleCoinsSpent:gifter?.eligible_coins_spent||0},error:null,meta:{requestId}});
 }
 if(method==='GET'&&p==='/api/v1/wallet/ledger'){
   const {user,token}=await auth(req);const rows=await supabase.request(`/rest/v1/ledger_entries?user_id=eq.${user.id}&select=id,entry_type,currency,amount_minor,balance_after,reference_type,reference_id,metadata,created_at&order=created_at.desc&limit=100`,{token});return json(res,200,{data:rows,error:null,meta:{requestId}});
 }
 if(method==='POST'&&p==='/api/v1/wallet/convert'){
    const {token}=await auth(req);const b=await bodyJson(req);
    const amount=boundedInt(b.amountUsdCents,100,100000000);
    const idempotency=cleanText(req.headers['idempotency-key']||b.idempotencyKey||'',120);
    if(idempotency.length<8)throw new HttpError(400,'VALIDATION_ERROR','Conversion idempotency key is required');
    const result=await rpc('convert_available_earnings_to_coins',{p_amount_usd_cents:amount,p_idempotency_key:idempotency},{token});
    return json(res,200,{data:result,error:null,meta:{requestId}});
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
