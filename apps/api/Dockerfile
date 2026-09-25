FROM node:24.19.0-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @accesslobby/api build
FROM node:24.19.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
