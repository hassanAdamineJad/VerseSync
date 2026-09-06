# Two targets from one file: `api` and `web`. docker-compose builds both.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH SKIP_PLAYWRIGHT_BROWSERS=1
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/ ./scripts/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install

COPY . .

FROM base AS api
WORKDIR /app/apps/api
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]

FROM base AS web
WORKDIR /app/apps/web
RUN pnpm build
EXPOSE 5173
CMD ["sh", "-c", "pnpm exec vite preview --host 0.0.0.0 --port ${PORT:-5173}"]