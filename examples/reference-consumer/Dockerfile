FROM node:24.19.0-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY examples/reference-consumer/package.json examples/reference-consumer/package.json
RUN pnpm install --frozen-lockfile --filter @accesslobby/reference-consumer --prod
COPY examples/reference-consumer/server.mjs examples/reference-consumer/policy.mjs examples/reference-consumer/
USER node
WORKDIR /app/examples/reference-consumer
EXPOSE 4000
CMD ["node", "server.mjs"]
