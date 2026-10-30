import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SupabaseProvider} from '../services/api/src/providers/supabase.mjs';
import {LiveKitProvider} from '../services/api/src/providers/livekit.mjs';
import {PayPalProvider} from '../services/api/src/providers/paypal.mjs';

test('Supabase replacement placeholders remain unconfigured and make no provider requests',async()=>{
  let fetchCalls=0;
  const provider=new SupabaseProvider({
    supabaseUrl:'https://REPLACE_WITH_ZOVARA_PROJECT.supabase.co',
    supabaseAnonKey:'REPLACE_WITH_ZOVARA_SUPABASE_ANON_KEY',
    supabaseServiceRoleKey:'REPLACE_WITH_ZOVARA_SUPABASE_SERVICE_ROLE_KEY'
  },async()=>{fetchCalls++;throw new Error('Placeholder configuration must not call Supabase');});

  assert.equal(provider.configured(),false);
  assert.equal(provider.serviceConfigured(),false);
  await assert.rejects(provider.request('/rest/v1/profiles'),{code:'CONFIGURATION_REQUIRED'});
  await assert.rejects(provider.request('/rest/v1/rpc/admin_task',{service:true}),{code:'CONFIGURATION_REQUIRED'});
  assert.equal(fetchCalls,0);
});

test('Supabase service-role placeholder does not enable privileged requests',async()=>{
  let fetchCalls=0;
  const provider=new SupabaseProvider({
    supabaseUrl:'https://zovara-test.supabase.co',
    supabaseAnonKey:'public-anon-key-stub',
    supabaseServiceRoleKey:'REPLACE_WITH_ZOVARA_SUPABASE_SERVICE_ROLE_KEY'
  },async()=>{fetchCalls++;throw new Error('Placeholder service-role key must not call Supabase');});

  assert.equal(provider.configured(),true);
  assert.equal(provider.serviceConfigured(),false);
  await assert.rejects(provider.request('/rest/v1/rpc/admin_task',{service:true}),{code:'CONFIGURATION_REQUIRED'});
  assert.equal(fetchCalls,0);
});

test('background worker refuses replacement placeholders before polling Supabase',()=>{
  const workerPath=fileURLToPath(new URL('../services/background-workers/src/worker.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[workerPath],{
    encoding:'utf8',
    env:{
      ...process.env,
      SUPABASE_URL:'https://REPLACE_WITH_ZOVARA_PROJECT.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'REPLACE_WITH_ZOVARA_SUPABASE_SERVICE_ROLE_KEY'
    }
  });
  assert.equal(result.status,2);
  assert.match(result.stderr,/worker_configuration_missing/);
  assert.doesNotMatch(result.stdout,/worker_started/);
});

test('LiveKit replacement placeholders remain unconfigured and make no provider requests',async()=>{
  let fetchCalls=0;
  const provider=new LiveKitProvider({
    livekitUrl:'wss://REPLACE_WITH_ZOVARA_PROJECT.livekit.cloud',
    livekitApiKey:'REPLACE_WITH_ZOVARA_LIVEKIT_API_KEY',
    livekitApiSecret:'REPLACE_WITH_ZOVARA_LIVEKIT_API_SECRET'
  },async()=>{fetchCalls++;throw new Error('Placeholder configuration must not call LiveKit');});

  assert.equal(provider.configured(),false);
  assert.deepEqual(await provider.healthCheck(),{
    configured:false,
    reachable:false,
    code:'CONFIGURATION_REQUIRED'
  });
  assert.throws(()=>provider.token({identity:'test'}),{code:'CONFIGURATION_REQUIRED'});
  assert.equal(fetchCalls,0);
});

test('PayPal replacement placeholders remain unconfigured and make no provider requests',async()=>{
  let fetchCalls=0;
  const provider=new PayPalProvider({
    paypalEnvironment:'sandbox',
    paypalClientId:'REPLACE_WITH_ZOVARA_PAYPAL_SANDBOX_CLIENT_ID',
    paypalClientSecret:'REPLACE_WITH_ZOVARA_PAYPAL_SANDBOX_CLIENT_SECRET',
    paypalWebhookId:'REPLACE_WITH_ZOVARA_PAYPAL_SANDBOX_WEBHOOK_ID'
  },async()=>{fetchCalls++;throw new Error('Placeholder configuration must not call PayPal');});

  assert.equal(provider.configured(),false);
  await assert.rejects(provider.accessToken(),{code:'CONFIGURATION_REQUIRED'});
  await assert.rejects(provider.verifyWebhook({},{}),{code:'CONFIGURATION_REQUIRED'});
  assert.equal(fetchCalls,0);
});
