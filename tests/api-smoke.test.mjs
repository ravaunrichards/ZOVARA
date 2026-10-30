import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../services/api/src/server.mjs';import {SupabaseProvider} from '../services/api/src/providers/supabase.mjs';
let server,base;
before(async()=>{server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function get(path){const r=await fetch(base+path);return {r,body:await r.json()};}
test('health is available without external providers',async()=>{const {r,body}=await get('/healthz');assert.equal(r.status,200);assert.equal(body.status,'ok');});
test('public gift and gifter badge catalogs are served from source registries',async()=>{const g=await get('/api/v1/catalog/gifts');assert.equal(g.r.status,200);assert.ok(g.body.data.gifts.length>=100);const b=await get('/api/v1/catalog/gifter-levels');assert.equal(b.r.status,200);assert.equal(b.body.data.levels.length,50);});
test('style registry summary reports exactly 1,000 generated configurations',async()=>{const s=await get('/api/v1/catalog/styles');assert.equal(s.r.status,200);assert.equal(s.body.data.count,1000);});
test('client config never includes server-only secret names/values',async()=>{const {r,body}=await get('/api/v1/client-config');assert.equal(r.status,200);assert.equal(JSON.stringify(body).includes('SUPABASE_SERVICE_ROLE_KEY'),false);assert.equal(JSON.stringify(body).includes('PAYPAL_CLIENT_SECRET'),false);assert.equal(JSON.stringify(body).includes('LIVEKIT_API_SECRET'),false);});
test('protected identity API rejects an anonymous request',async()=>{const r=await fetch(base+'/api/v1/me');assert.equal(r.status,401);const b=await r.json();assert.equal(b.error.code,'UNAUTHENTICATED');});
test('feed reports missing Supabase instead of making up posts',async()=>{const r=await fetch(base+'/api/v1/feed');assert.ok([502,503].includes(r.status));const b=await r.json();assert.equal(b.data,null);});

test('implementation inventory endpoint returns the feature registry used by the web client',async()=>{
 const {r,body}=await get('/api/v1/features');
 assert.equal(r.status,200);
 assert.ok(Array.isArray(body.data.features));
 assert.ok(body.data.features.length>0);
});
test('Supabase exact-count helper reads Content-Range without loading every relationship row',async()=>{
 let requestUrl='',requestOptions=null;
 const provider=new SupabaseProvider({supabaseUrl:'https://zovara-test.supabase.co',supabaseAnonKey:'test-anon-key'},async(url,options)=>{
  requestUrl=url;requestOptions=options;
  return new Response(null,{status:200,headers:{'content-range':'0-0/123'}});
 });
 assert.equal(await provider.count('/rest/v1/follows?select=follower_id',{token:'user-access-token'}),123);
 assert.ok(requestUrl.includes('/rest/v1/follows?select=follower_id'));
 assert.equal(requestOptions.method,'HEAD');
 assert.equal(requestOptions.headers.Prefer,'count=exact');
 assert.equal(requestOptions.headers.Range,'0-0');
});
