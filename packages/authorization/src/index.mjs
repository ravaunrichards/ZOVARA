const permissions = Object.freeze({
  visitor: ['feed:read','catalog:read','profile:read:public'],
  viewer: ['feed:read','catalog:read','profile:read:public','profile:edit:self','post:create','post:delete:self','follow:write','gift:send','message:send','live:join'],
  creator: ['feed:read','catalog:read','profile:read:public','profile:edit:self','post:create','post:delete:self','follow:write','gift:send','message:send','live:join','live:create','live:host','analytics:read:self','payout:request:self'],
  moderator: ['feed:read','catalog:read','live:moderate:assigned','content:moderate:assigned','report:review:assigned'],
  admin: ['*']
});
export function hasPermission(role, permission) { const p = permissions[role] ?? []; return p.includes('*') || p.includes(permission); }
export function requirePermission(role, permission) { if (!hasPermission(role, permission)) { const e = new Error('Permission denied'); e.statusCode = 403; e.code = 'FORBIDDEN'; throw e; } }
export function listRolePermissions() { return structuredClone(permissions); }
