FROM node:22.18-alpine AS build
WORKDIR /app
RUN corepack enable
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY backend/api/package.json backend/api/package.json
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm --filter @zovara/web build
FROM node:22.18-alpine AS runner
WORKDIR /app
RUN npm install --global serve@14.2.4
COPY --from=build /app/apps/web/dist ./dist
EXPOSE 5173
CMD ["serve","-s","dist","-l","5173"]
