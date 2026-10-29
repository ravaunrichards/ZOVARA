import type { ApiErrorShape } from '@zovara/shared-types';
const API_BASE = (import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_API_BASE_URL || 'http://localhost:4000';
let sessionToken: string | null = null;
export function setApiToken(token:string|null){sessionToken=token;}
export function getApiBase(){return API_BASE;}
export class ApiError extends Error { constructor(message:string,public status:number,public code='REQUEST_ERROR'){super(message);} }
export async function api<T>(path:string, options:RequestInit = {}):Promise<T>{
 const headers=new Headers(options.headers); if(sessionToken)headers.set('Authorization',`Bearer ${sessionToken}`);
 if(options.body && !(options.body instanceof FormData) && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
 let response:Response;
 try { response=await fetch(`${API_BASE}${path}`,{...options,headers}); }
 catch { throw new ApiError('Cannot reach the ZOVARA API. Check that the API service is running.',0,'NETWORK_ERROR'); }
 if(response.status===204)return undefined as T;
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const e=data as Partial<ApiErrorShape>;throw new ApiError(e.error?.message||`Request failed (${response.status}).`,response.status,e.error?.code||'REQUEST_ERROR');}
 return data as T;
}
export function jsonBody(value:unknown){return JSON.stringify(value);}
