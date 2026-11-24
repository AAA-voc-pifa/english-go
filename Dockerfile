# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-bookworm-slim

# --- dependencies ---
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm \
  && pnpm install --frozen-lockfile

# --- build ---
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Standalone copy expects this path even if the app has no static assets.
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN corepack enable pnpm && pnpm build

# --- run ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8000
ENV HOSTNAME=0.0.0.0

RUN mkdir -p public .next \
  && chown -R node:node /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 8000
CMD ["node", "server.js"]
