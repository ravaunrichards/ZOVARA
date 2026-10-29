FROM node:22.18-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY backend/api/package.json backend/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm --filter @zovara/api build
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh","-c","pnpm --filter @zovara/api db:migrate && pnpm --filter @zovara/api start"]
