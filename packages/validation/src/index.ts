import { z } from 'zod';
export const usernameSchema = z.string().trim().regex(/^[a-zA-Z0-9_.]{3,30}$/);
export const registrationSchema = z.object({ email: z.string().trim().email().max(254), username: usernameSchema, displayName: z.string().trim().min(1).max(80), password: z.string().min(10).max(128) });
export const profileSchema = z.object({ mode: z.enum(['personal','creator','business','community']).optional(), bio: z.string().max(300).optional(), pronouns: z.string().max(60).optional() }).strict();
export const postSchema = z.object({ caption: z.string().trim().max(2200).default(''), visibility: z.enum(['public','followers','private']).default('public') });
export const reportSchema = z.object({ targetType: z.enum(['user','post','comment','livestream','message','community']), targetId: z.string().uuid(), reason: z.enum(['spam','harassment','hate','sexual_content','violence','scam','impersonation','copyright','other']), details: z.string().max(2000).default('') });
