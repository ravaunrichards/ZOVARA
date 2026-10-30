import {randomUUID} from 'node:crypto';
const url=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const isRealCredential=value=>{
 const normalized=String(value??'').trim();
 return Boolean(normalized)&&!/(?:replace[_ -]?with|placeholder|change[_ -]?me|your[_ -])/i.test(normalized);
};
if(!isRealCredential(url)||!isRealCredential(key)){console.error(JSON.stringify({level:'error',event:'worker_configuration_missing',required:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']}));process.exit(2);}
const worker=`zovara-worker-${process.env.RENDER_INSTANCE_ID||randomUUID()}`;
async function rpc(name,body){const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const t=await r.text();if(!r.ok)throw new Error(`${name} failed with ${r.status}: ${t.slice(0,200)}`);return t?JSON.parse(t):null;}
async function processJob(job){
 // Each accepted job type must have a real implementation before it is acknowledged.
 if(job.job_type==='outbox.publish'){
   const id=job.payload?.outboxId;if(!id)throw new Error('outbox.publish requires payload.outboxId');await rpc('publish_outbox_event',{p_id:id});return;
 }
 if(job.job_type==='health.check')return;
 throw new Error(`Unsupported job type: ${job.job_type}. Add an implementation before enqueueing this job.`);
}
async function runOnce(){const jobs=await rpc('claim_background_jobs',{p_worker:worker,p_limit:10});for(const job of jobs||[]){try{await processJob(job);await rpc('finish_background_job',{p_job_id:job.id,p_success:true,p_error:null});console.log(JSON.stringify({level:'info',event:'job_completed',jobId:job.id,type:job.job_type}));}catch(e){await rpc('finish_background_job',{p_job_id:job.id,p_success:false,p_error:String(e.message).slice(0,1500)});console.error(JSON.stringify({level:'error',event:'job_failed',jobId:job.id,type:job.job_type,error:String(e.message)}));}}}
console.log(JSON.stringify({level:'info',event:'worker_started',worker}));
// A modest interval avoids busy-looping. Deploy one worker per queue group; functions use SKIP LOCKED.
while(true){try{await runOnce();}catch(e){console.error(JSON.stringify({level:'error',event:'worker_poll_failed',error:String(e.message)}));}await new Promise(resolve=>setTimeout(resolve,2500));}
