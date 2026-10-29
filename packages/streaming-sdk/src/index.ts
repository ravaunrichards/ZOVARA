import { api, jsonBody } from '@zovara/api-client';
export type LiveConnection = {stream:{id:string;title:string};serverUrl:string;token:string;role:'host'|'viewer'};
export async function startStream(title:string){return api<LiveConnection>('/api/live/start',{method:'POST',body:jsonBody({title})});}
export async function joinStream(streamId:string){return api<LiveConnection>(`/api/live/${encodeURIComponent(streamId)}/join`,{method:'POST'});}
export async function leaveStream(streamId:string){return api<{left:boolean}>(`/api/live/${encodeURIComponent(streamId)}/leave`,{method:'POST'});}
export async function endStream(streamId:string){return api<{ended:boolean}>(`/api/live/${encodeURIComponent(streamId)}/end`,{method:'POST'});}
