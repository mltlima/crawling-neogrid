# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Keep this tag aligned with the installed Playwright package version.
FROM mcr.microsoft.com/playwright:v1.61.1-noble AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=pwuser:pwuser package.json package-lock.json ./
COPY --chown=pwuser:pwuser --from=build /app/node_modules ./node_modules
COPY --chown=pwuser:pwuser --from=build /app/dist ./dist

USER pwuser
ENTRYPOINT ["node", "dist/cli/index.js"]
