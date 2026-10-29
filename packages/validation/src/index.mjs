export function isUuid(v) { return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
export function cleanText(v, max = 500) { if (typeof v !== 'string') return ''; return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max); }
export function isSafeHandle(v) { return typeof v === 'string' && /^[a-zA-Z0-9_.]{3,30}$/.test(v); }
export function boundedInt(v, min, max) { const n = Number(v); if (!Number.isSafeInteger(n) || n < min || n > max) throw new TypeError(`Expected integer from ${min} to ${max}`); return n; }
export function isHttpsOrLocalUrl(v) { try { const u = new URL(v); return u.protocol === 'https:' || (['localhost','127.0.0.1'].includes(u.hostname) && u.protocol === 'http:'); } catch { return false; } }
