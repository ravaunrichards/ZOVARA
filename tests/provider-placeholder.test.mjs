import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveKitProvider} from '../services/api/src/providers/livekit.mjs';
import {PayPalProvider} from '../services/api/src/providers/paypal.mjs';

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
