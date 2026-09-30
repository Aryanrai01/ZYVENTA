# syntax=docker/dockerfile:1.7
# Build context: repository root  →  docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ── Install workspace deps (cached unless manifests change) ──────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@zyventa/api..."

# ── Compile shared + api, then produce a pruned production bundle ────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @zyventa/shared build \
 && pnpm --filter @zyventa/api build \
 && pnpm --filter @zyventa/api deploy --prod --legacy /out

# ── Runtime: no compilers, no dev deps, non-root ─────────────────────────────
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["sh", "-c", "wget -qO- http://127.0.0.1:${PORT:-4000}/api/v1/health/live > /dev/null || exit 1"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
