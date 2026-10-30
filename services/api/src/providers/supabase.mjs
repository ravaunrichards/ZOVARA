export class ProviderError extends Error { constructor(message,status=502,code='PROVIDER_ERROR'){super(message);this.statusCode=status;this.code=code;} }

function isRealCredential(value){
 const normalized=String(value??'').trim();
 return Boolean(normalized)&&!/(?:replace[_ -]?with|placeholder|change[_ -]?me|your[_ -])/i.test(normalized);
}

export class SupabaseProvider {
 constructor(config, fetchImpl=fetch){this.config=config;this.fetch=fetchImpl;}
 configured(){return isRealCredential(this.config.supabaseUrl)&&isRealCredential(this.config.supabaseAnonKey);}
 serviceConfigured(){return this.configured()&&isRealCredential(this.config.supabaseServiceRoleKey);}
 async request(path,{method='GET',body,token,service=false,headers={}}={}){
  if(!this.configured() || (service&&!this.serviceConfigured())) throw new ProviderError('Supabase integration is not configured. Set the required server environment variables.',503,'CONFIGURATION_REQUIRED');
  const base=this.config.supabaseUrl.replace(/\/$/,'');
  const auth=service?this.config.supabaseServiceRoleKey:(token||this.config.supabaseAnonKey);
  const h={apikey:service?this.config.supabaseServiceRoleKey:this.config.supabaseAnonKey,Authorization:`Bearer ${auth}`,Accept:'application/json',...headers};
  if(body!==undefined)h['Content-Type']='application/json';
  const response=await this.fetch(`${base}${path.startsWith('/')?path:`/${path}`}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const text=await response.text(); let data=null; try{data=text?JSON.parse(text):null;}catch{data={message:text.slice(0,300)};}
  if(!response.ok){
   const message=(data&&typeof data.message==='string'?data.message:(data&&typeof data.msg==='string'?data.msg:(data&&typeof data.hint==='string'?data.hint:'Supabase request failed')));
   const denied=response.status===403||data?.code==='42501'||/permission denied|row level security|row-level security|insufficient privilege|not authorized/i.test(message);
   throw new ProviderError(message,denied?403:response.status,denied?'FORBIDDEN':response.status===401?'UNAUTHENTICATED':'PROVIDER_ERROR');
  }
  return data;
 }
 async userFromToken(token){
  if(!token) {const e=new Error('Sign in is required');e.statusCode=401;e.code='UNAUTHENTICATED';throw e;}
  if(!this.configured()) throw new ProviderError('Supabase Auth is not configured.',503,'CONFIGURATION_REQUIRED');
  const base=this.config.supabaseUrl.replace(/\/$/,'');
  const r=await this.fetch(`${base}/auth/v1/user`,{headers:{apikey:this.config.supabaseAnonKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!r.ok){const e=new Error(r.status===401?'Session expired or invalid':'Could not validate account session');e.statusCode=r.status===401?401:502;e.code=r.status===401?'UNAUTHENTICATED':'PROVIDER_ERROR';throw e;}
  const u=await r.json();if(!u?.id){const e=new Error('Session did not identify an account');e.statusCode=401;e.code='UNAUTHENTICATED';throw e;}return u;
 }
}
