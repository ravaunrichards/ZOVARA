import {createHmac} from 'node:crypto';

function b64url(value){
  return Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
}

function roomServiceBase(rawUrl){
  let endpoint;
  try{
    endpoint=new URL(String(rawUrl||'').trim());
  }catch{
    const error=new Error('LIVEKIT_URL must be a valid LiveKit server URL');
    error.statusCode=503;
    error.code='LIVEKIT_CONFIGURATION_INVALID';
    throw error;
  }
  if(endpoint.protocol==='wss:')endpoint.protocol='https:';
  else if(endpoint.protocol==='ws:')endpoint.protocol='http:';
  if(!['http:','https:'].includes(endpoint.protocol)){
    const error=new Error('LIVEKIT_URL must use ws, wss, http, or https');
    error.statusCode=503;
    error.code='LIVEKIT_CONFIGURATION_INVALID';
    throw error;
  }
  endpoint.pathname=endpoint.pathname.replace(/\/rtc\/?$/,'').replace(/\/+$/,'');
  endpoint.search='';
  endpoint.hash='';
  return endpoint.toString().replace(/\/$/,'');
}

export class LiveKitProvider{
  constructor(config,fetchImpl=fetch){
    this.config=config;
    this.fetch=fetchImpl;
  }

  configured(){
    return Boolean(this.config.livekitUrl&&this.config.livekitApiKey&&this.config.livekitApiSecret);
  }

  token(claims){
    if(!this.configured()){
      const error=new Error('LiveKit is not configured');
      error.statusCode=503;
      error.code='CONFIGURATION_REQUIRED';
      throw error;
    }
    const now=Math.floor(Date.now()/1000);
    const header={alg:'HS256',typ:'JWT'};
    const payload={
      iss:this.config.livekitApiKey,
      sub:claims.identity||'zovara-service',
      nbf:now-5,
      iat:now,
      exp:now+Math.min(3600,Math.max(60,claims.ttlSeconds||900)),
      video:claims.video||{}
    };
    const body=`${b64url(header)}.${b64url(payload)}`;
    const signature=createHmac('sha256',this.config.livekitApiSecret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  async roomRequest(method,body,token){
    const base=roomServiceBase(this.config.livekitUrl);
    let response;
    try{
      response=await this.fetch(`${base}/twirp/livekit.RoomService/${method}`,{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(15000)
      });
    }catch{
      const error=new Error('LiveKit room service is unreachable');
      error.statusCode=502;
      error.code='LIVEKIT_UNREACHABLE';
      throw error;
    }

    const text=await response.text();
    if(!response.ok){
      const error=new Error(`LiveKit room service rejected the request (HTTP ${response.status})`);
      error.statusCode=502;
      error.code='LIVEKIT_PROVIDER_ERROR';
      error.providerStatus=response.status;
      throw error;
    }
    if(!text)return {};
    try{return JSON.parse(text);}
    catch{
      const error=new Error('LiveKit returned an invalid room-service response');
      error.statusCode=502;
      error.code='LIVEKIT_INVALID_RESPONSE';
      throw error;
    }
  }

  async createRoom(roomName,maxParticipants=100){
    const token=this.token({identity:'zovara-room-service',video:{roomCreate:true}});
    return this.roomRequest('CreateRoom',{name:roomName,maxParticipants,emptyTimeout:300},token);
  }

  async deleteRoom(roomName){
    const token=this.token({identity:'zovara-room-service',video:{roomAdmin:true,room:roomName}});
    try{return await this.roomRequest('DeleteRoom',{room:roomName},token);}
    catch(error){
      if(error.providerStatus===404)return {deleted:false,alreadyGone:true};
      throw error;
    }
  }

  createParticipantToken({identity,name,room,canPublish,canSubscribe=true,canPublishData=true,ttlSeconds=900}){
    return this.token({
      identity,
      name,
      ttlSeconds,
      video:{roomJoin:true,room,canPublish,canSubscribe,canPublishData}
    });
  }

  async healthCheck(){
    if(!this.configured()){
      return {configured:false,reachable:false,code:'CONFIGURATION_REQUIRED'};
    }
    try{
      const token=this.token({identity:'zovara-health-check',video:{roomList:true}});
      await this.roomRequest('ListRooms',{names:[]},token);
      return {configured:true,reachable:true};
    }catch(error){
      return {configured:true,reachable:false,code:error.code||'LIVEKIT_UNAVAILABLE'};
    }
  }
}
