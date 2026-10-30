import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {LiveKitProvider} from '../services/api/src/providers/livekit.mjs';

function decodePayload(token){
  const parts=token.split('.');
  assert.equal(parts.length,3,'token must be a signed JWT');
  const expected=createHmac('sha256','zovara-test-secret').update(parts[0]+'.'+parts[1]).digest('base64url');
  assert.equal(parts[2],expected,'JWT signature must match the server secret');
  return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
}

test('LiveKit room-service requests convert WSS URL to HTTPS Twirp URL',async()=>{
  let captured;
  const provider=new LiveKitProvider({
    livekitUrl:'wss://zovara-test.livekit.cloud/rtc/',
    livekitApiKey:'zovara-test-key',
    livekitApiSecret:'zovara-test-secret'
  },async(url,options)=>{
    captured={url:String(url),options};
    return new Response(JSON.stringify({name:'zovara-test-room'}),{status:200,headers:{'Content-Type':'application/json'}});
  });

  const result=await provider.createRoom('zovara-test-room',8);
  assert.equal(result.name,'zovara-test-room');
  assert.equal(captured.url,'https://zovara-test.livekit.cloud/twirp/livekit.RoomService/CreateRoom');
  assert.equal(captured.options.method,'POST');
  assert.equal(captured.options.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(captured.options.body),{name:'zovara-test-room',maxParticipants:8,emptyTimeout:300});
  const authorization=captured.options.headers.Authorization;
  assert.ok(authorization.startsWith('Bearer '));
  const payload=decodePayload(authorization.slice('Bearer '.length));
  assert.equal(payload.iss,'zovara-test-key');
  assert.equal(payload.video.roomCreate,true);
});

test('participant token is scoped to one room with the supplied publish permissions',()=>{
  const provider=new LiveKitProvider({
    livekitUrl:'wss://zovara-test.livekit.cloud',
    livekitApiKey:'zovara-test-key',
    livekitApiSecret:'zovara-test-secret'
  });
  const token=provider.createParticipantToken({
    identity:'user-123',
    name:'Viewer',
    room:'zovara-room-123',
    canPublish:false,
    canSubscribe:true,
    canPublishData:true,
    ttlSeconds:300
  });
  const payload=decodePayload(token);
  assert.equal(payload.sub,'user-123');
  assert.equal(payload.name,'Viewer');
  assert.equal(payload.video.room,'zovara-room-123');
  assert.equal(payload.video.roomJoin,true);
  assert.equal(payload.video.canPublish,false);
  assert.equal(payload.video.canSubscribe,true);
  assert.equal(payload.video.canPublishData,true);
  assert.ok(payload.exp-payload.iat<=300);
});

test('room viewer lookup uses a room-scoped admin grant',async()=>{
  let requestUrl='';
  let requestBody=null;
  let tokenPayload=null;
  const provider=new LiveKitProvider({
    livekitUrl:'wss://zovara-test.livekit.cloud',
    livekitApiKey:'zovara-test-key',
    livekitApiSecret:'zovara-test-secret'
  },async(url,options)=>{
    requestUrl=String(url);
    requestBody=JSON.parse(options.body);
    tokenPayload=decodePayload(options.headers.Authorization.slice('Bearer '.length));
    return new Response(JSON.stringify({participants:[{identity:'user-123',name:'Jane (@jane)'}]}),{status:200});
  });

  const result=await provider.listParticipants('zovara-live-room');
  assert.equal(requestUrl,'https://zovara-test.livekit.cloud/twirp/livekit.RoomService/ListParticipants');
  assert.deepEqual(requestBody,{room:'zovara-live-room'});
  assert.equal(tokenPayload.sub,'zovara-room-service');
  assert.equal(tokenPayload.video.roomAdmin,true);
  assert.equal(tokenPayload.video.room,'zovara-live-room');
  assert.equal(result.participants[0].name,'Jane (@jane)');
});

test('LiveKit health check verifies room-list authorization without exposing room data',async()=>{
  let requestUrl='';
  let requestPayload;
  const provider=new LiveKitProvider({
    livekitUrl:'wss://zovara-test.livekit.cloud',
    livekitApiKey:'zovara-test-key',
    livekitApiSecret:'zovara-test-secret'
  },async(url,options)=>{
    requestUrl=String(url);
    requestPayload=decodePayload(options.headers.Authorization.slice('Bearer '.length));
    return new Response(JSON.stringify({rooms:[{name:'private-room-name'}]}),{status:200});
  });
  const health=await provider.healthCheck();
  assert.deepEqual(health,{configured:true,reachable:true});
  assert.equal(requestUrl,'https://zovara-test.livekit.cloud/twirp/livekit.RoomService/ListRooms');
  assert.equal(requestPayload.video.roomList,true);
});

test('LiveKit health check reports missing credentials rather than false success',async()=>{
  const provider=new LiveKitProvider({livekitUrl:'',livekitApiKey:'',livekitApiSecret:''});
  assert.deepEqual(await provider.healthCheck(),{configured:false,reachable:false,code:'CONFIGURATION_REQUIRED'});
});
