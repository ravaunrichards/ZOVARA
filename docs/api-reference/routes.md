# API route map

All routes are mounted under `/api`. JSON errors use `{ error: { code, message } }`. Authenticated routes require a valid bearer token; API authorization is checked server-side.

| Route | Purpose | Access |
|---|---|---|
| `GET /health` | API and PostgreSQL health | Public |
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Account lifecycle and session identity | Public / authenticated |
| `GET /profiles/:username`, `GET /profiles/me`, `PATCH /profiles/me`, `POST /profiles/:username/follow` | Public profile, own profile customization, follow toggle | Mixed |
| `GET /api/feed`, `GET /api/posts/mine`, `POST /api/posts`, `DELETE /api/posts/:id`, `POST /api/posts/:id/like`, `GET /api/posts/:id/comments`, `POST /api/posts/:id/comments`, `POST /api/posts/:id/save`, `GET /api/saved` | Feed and content actions | Mixed |
| `GET /search` | Search users/posts/communities | Public |
| `GET /communities`, `POST /communities`, `POST /communities/:slug/join` | Community discovery and membership | Mixed |
| `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read` | User notifications | Authenticated |
| `GET /messages/:username`, `POST /messages/:username` | Direct messages | Authenticated |
| `POST /reports` | Moderation report submission | Authenticated |
| `GET /wallet`, `GET /wallet/packs`, `GET /wallet/gifts`, `POST /gifts/send` | Wallet view, coin packs, gifts | Mixed |
| `POST /payments/stripe/checkout`, `POST /payments/stripe/webhook` | Card checkout and signed payment/refund events | Authenticated / signed provider webhook |
| `GET /live`, `POST /live/start`, `POST /live/:id/join`, `POST /live/:id/leave`, `POST /live/:id/end` | Livestream lifecycle and tokens | Mixed |
| `/admin/*` | Moderation and restricted operations | Admin role |

The server route implementations and Zod request schemas are the source of truth. Confirm exact request/response fields in the corresponding handler before integrating a third-party client. The API does not claim that unconfigured providers are available.
