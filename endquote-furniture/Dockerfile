FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY vite.config.ts tsconfig*.json index.html ./
RUN npm run build

FROM node:24-bookworm-slim AS server
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci
COPY server/prisma ./prisma
COPY server/prisma.config.ts server/tsconfig.json ./
COPY server/src ./src
RUN npm run generate && npm run build
COPY --from=web /web/dist /app/dist
ENV BIND_HOST=0.0.0.0 NODE_ENV=production
USER node
CMD ["node","dist/src/main.js"]
