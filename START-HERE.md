# Start ZOVARA (read this before opening `index.html`)

**Do not open `apps/web/index.html` directly from your file manager.** It is a Vite/React entry point, not a self-contained HTML app. Direct file opening is now detected and displays a launch explanation instead of a blank screen.

## Local development

Requirements: Node.js 22.18+, pnpm 10+, Docker with Compose.

1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` (32+ characters).
2. Start PostgreSQL: `docker compose up -d db`
3. Install dependencies: `pnpm install`
4. Apply migrations: `pnpm db:migrate`
5. Start the web app and API: `pnpm dev`
6. Open `http://localhost:5173`.

If dependency installation fails because a package registry is unavailable, the app will not start until dependencies can be installed. The full social features also require the API and PostgreSQL to be running. Stripe, LiveKit, and production object storage need their own provider credentials.

## Opening from Android

An Android file manager cannot run the Node.js development server simply by tapping the HTML file. Use a Node.js-capable development environment or deploy the repository to a supported host, configure environment variables and a PostgreSQL database, then visit the hosted URL in your browser.
