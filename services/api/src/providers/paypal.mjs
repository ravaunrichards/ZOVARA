import {randomUUID} from 'node:crypto';
export class PayPalProvider {
 constructor(config,fetchImpl=fetch){this.config=config;this.fetch=fetchImpl;}
 get base(){return this.config.paypalEnvironment==='production'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';}
 configured(){return Boolean(this.config.paypalClientId&&this.config.paypalClientSecret);}
 async accessToken(){if(!this.configured()){const e=new Error('PayPal credentials are not configured');e.statusCode=503;e.code='CONFIGURATION_REQUIRED';throw e;}
  const r=await this.fetch(`${this.base}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${this.config.paypalClientId}:${this.config.paypalClientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token){const e=new Error('PayPal could not authorize server access');e.statusCode=502;e.code='PROVIDER_ERROR';throw e;}return d.access_token;
 }
 async request(path,{method='GET',body,requestId=randomUUID(),token}={}){
  const access=token||await this.accessToken();const headers={Authorization:`Bearer ${access}`,Accept:'application/json','PayPal-Request-Id':requestId};if(body!==undefined)headers['Content-Type']='application/json';
  const r=await this.fetch(`${this.base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const d=await r.json().catch(()=>({}));if(!r.ok){const detail=d?.details?.[0]?.description||d?.message||'PayPal request failed';const e=new Error(detail);e.statusCode=502;e.code='PROVIDER_ERROR';e.providerStatus=r.status;throw e;}return d;
 }
 async verifyWebhook(headers,event){
  if(!this.config.paypalWebhookId) {const e=new Error('PayPal webhook ID is not configured');e.statusCode=503;e.code='CONFIGURATION_REQUIRED';throw e;}
  const payload={auth_algo:headers['paypal-auth-algo'],cert_url:headers['paypal-cert-url'],transmission_id:headers['paypal-transmission-id'],transmission_sig:headers['paypal-transmission-sig'],transmission_time:headers['paypal-transmission-time'],webhook_id:this.config.paypalWebhookId,webhook_event:event};
  const result=await this.request('/v1/notifications/verify-webhook-signature',{method:'POST',body:payload});return result.verification_status==='SUCCESS';
 }
}
