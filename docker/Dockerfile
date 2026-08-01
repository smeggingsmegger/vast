# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm config set ignore-scripts false \
  && pnpm install --frozen-lockfile
# Clean build outputs (ignore any stale incremental info)
RUN rm -rf packages/*/dist apps/*/dist packages/*/*.tsbuildinfo apps/*/*.tsbuildinfo \
  && pnpm exec tsc -b packages/shared packages/mongo-core apps/server --force \
  && test -f apps/server/dist/index.js \
  && pnpm --filter @vast/web build \
  && pnpm --filter @vast/server deploy --prod --legacy /app/deploy \
  && rm -rf /app/deploy/src /app/deploy/vitest.config.ts /app/deploy/tsconfig.json /app/deploy/tsconfig.tsbuildinfo \
  && cp -a /app/apps/server/dist /app/deploy/dist

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system vast \
  && useradd --system --gid vast --create-home --home-dir /app --shell /usr/sbin/nologin vast

WORKDIR /app

COPY --from=build /app/deploy/ ./
COPY --from=build /app/apps/web/dist ./web-dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data \
  && chown -R vast:vast /app /data

ENV NODE_ENV=production \
    PORT=8080 \
    VAST_BIND=0.0.0.0 \
    VAST_RUNTIME=web \
    VAST_DATA_DIR=/data \
    VAST_WEB_DIST=/app/web-dist \
    VAST_AUTH_MODE=none

USER vast
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
