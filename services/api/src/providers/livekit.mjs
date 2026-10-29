import {createHmac} from 'node:crypto';
function b64url(value){return Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');}
export class LiveKitProvider {
 constructor(config,fetchImpl=fetch){this.config=config;this.fetch=fetchImpl;}
 configured(){return Boolean(this.config.livekitUrl&&this.config.livekitApiKey&&this.config.livekitApiSecret);}
 token(claims){
  if(!this.configured()){const e=new Error('LiveKit is not configured');e.statusCode=503;e.code='CONFIGURATION_REQUIRED';throw e;}
  const now=Math.floor(Date.now()/1000);const header={alg:'HS256',typ:'JWT'};const payload={iss:this.config.livekitApiKey,sub:claims.identity||'zovara-service',nbf:now-5,iat:now,exp:now+Math.min(3600,Math.max(60,claims.ttlSeconds||900)),name:claims.name||'ZOVARA',video:claims.video||{}};
  const body=`${b64url(header)}.${b64url(payload)}`;const sig=createHmac('sha256',this.config.livekitApiSecret).update(body).digest('base64url');return `${body}.${sig}`;
 }
 async roomRequest(method,body,token){const base=this.config.livekitUrl.replace(/\/$/,'').replace(/\/rtc$/,'');const r=await this.fetch(`${base}/twirp/livekit.RoomService/${method}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const t=await r.text();let d={};try{d=t?JSON.parse(t):{};}catch{}if(!r.ok){const e=new Error('LiveKit room service request failed');e.statusCode=502;e.code='PROVIDER_ERROR';throw e;}return d;}
 async createRoom(roomName,maxParticipants=100){const token=this.token({identity:'zovara-room-service',video:{roomCreate:true,roomAdmin:true}});return this.roomRequest('CreateRoom',{name:roomName,maxParticipants,emptyTimeout:300},token);}
 async deleteRoom(roomName){const token=this.token({identity:'zovara-room-service',video:{roomAdmin:true,room:roomName}});return this.roomRequest('DeleteRoom',{room:roomName},token);}
 createParticipantToken({identity,name,room,canPublish,canSubscribe=true,canPublishData=true,ttlSeconds=900}){return this.token({identity,name,ttlSeconds,video:{roomJoin:true,room,canPublish,canSubscribe,canPublishData}});}
}
