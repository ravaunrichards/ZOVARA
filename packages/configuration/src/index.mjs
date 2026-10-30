function boundedEnvironmentInteger(value,fallback,min,max){
  const number=Number(value??fallback);
  return Number.isSafeInteger(number)&&number>=min&&number<=max?number:fallback;
}

export function readConfig(env = process.env) {
  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development', port: Number(env.PORT || 3000),
    supabaseUrl: env.SUPABASE_URL || '', supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    paypalEnvironment: env.PAYPAL_ENVIRONMENT || 'sandbox', paypalClientId: env.PAYPAL_CLIENT_ID || '',
    paypalClientSecret: env.PAYPAL_CLIENT_SECRET || '', paypalWebhookId: env.PAYPAL_WEBHOOK_ID || '',
    paypalPayoutsEnabled: env.PAYPAL_PAYOUTS_ENABLED === 'true',
    livekitUrl: env.LIVEKIT_URL || '', livekitApiKey: env.LIVEKIT_API_KEY || '', livekitApiSecret: env.LIVEKIT_API_SECRET || '',
    livekitDefaultRoomMaxParticipants: boundedEnvironmentInteger(env.LIVEKIT_DEFAULT_ROOM_MAX_PARTICIPANTS, 100, 1, 1000),
    publicAppUrl: env.PUBLIC_APP_URL || `http://localhost:${env.PORT || 3000}`,
    corsOrigins: (env.CORS_ORIGINS || `http://localhost:${env.PORT || 3000}`).split(',').map(x=>x.trim()).filter(Boolean),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60000), rateLimitMaxRequests: Number(env.RATE_LIMIT_MAX_REQUESTS || 120),
    coinCustomMin: Number(env.COIN_CUSTOM_MIN || 100), coinCustomMax: Number(env.COIN_CUSTOM_MAX || 1000000),
    coinPricePer100Usd: Number(env.COIN_PRICE_PER_100_USD || 1), creatorShareBps: Number(env.CREATOR_SHARE_BPS || 5000),
    mediaBucket: env.SUPABASE_MEDIA_BUCKET || 'media', maxUploadBytes: Number(env.MAX_UPLOAD_BYTES || 524288000)
  });
}
