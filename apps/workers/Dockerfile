FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/workers ./apps/workers
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/workers
EXPOSE 3458
CMD ["pnpm", "local"]
