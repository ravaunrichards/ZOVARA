import { api, jsonBody, setApiToken } from '@zovara/api-client';
import type { User } from '@zovara/shared-types';
export type Credentials = { email: string; password: string };
export async function signIn(credentials: Credentials) { const result = await api<{token:string;user:User}>('/api/auth/login',{method:'POST',body:jsonBody(credentials)}); setApiToken(result.token); return result; }
export async function signUp(input: Credentials & { username:string; displayName:string }) { const result = await api<{token:string;user:User}>('/api/auth/register',{method:'POST',body:jsonBody(input)}); setApiToken(result.token); return result; }
export async function currentSession() { return api<{user:User;profile:unknown}>('/api/auth/me'); }
export function clearSession() { setApiToken(null); }
