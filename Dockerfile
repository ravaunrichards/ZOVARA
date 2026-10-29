FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY . .
EXPOSE 3000
USER node
CMD ["node", "services/api/src/server.mjs"]
