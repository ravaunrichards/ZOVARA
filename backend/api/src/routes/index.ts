import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { profileRoutes } from './profiles.js';
import { postRoutes } from './posts.js';
import { communityRoutes } from './communities.js';
import { notificationRoutes } from './notifications.js';
import { walletRoutes } from './wallet.js';
import { liveRoutes } from './live.js';
import { adminRoutes } from './admin.js';
import { searchRoutes } from './search.js';
import { messageRoutes } from './messages.js';
import { reportRoutes } from './reports.js';
export async function registerRoutes(app: FastifyInstance) {
 await authRoutes(app); await profileRoutes(app); await postRoutes(app); await communityRoutes(app);
 await notificationRoutes(app); await walletRoutes(app); await liveRoutes(app); await adminRoutes(app);
 await searchRoutes(app); await messageRoutes(app); await reportRoutes(app);
}
