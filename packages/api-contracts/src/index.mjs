export const API_VERSION = 'v1';
export const API_ERROR_CODES = Object.freeze({
  CONFIGURATION_REQUIRED: 'CONFIGURATION_REQUIRED', UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN', NOT_FOUND: 'NOT_FOUND', VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED', PROVIDER_ERROR: 'PROVIDER_ERROR', CONFLICT: 'CONFLICT'
});
export function success(data, meta = {}) { return { data, meta, error: null }; }
export function failure(code, message, requestId) { return { data: null, meta: { requestId }, error: { code, message } }; }
