# syntax=docker/dockerfile:1.7
# ---- deps ---------------------------------------------------------
FROM node:20-alpine3.21 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspaces --include-workspace-root

# ---- build --------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
RUN npm -w @spectra/shared run build \
 && npm -w @spectra/server run build \
 && npm -w @spectra/web run build

# ---- runtime ------------------------------------------------------
FROM node:20-alpine3.21 AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk upgrade --no-cache && addgroup -S app && adduser -S app -G app

# Prune devDependencies
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspaces --include-workspace-root --omit=dev \
 && npm uninstall -g npm

# Copy built artifacts
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

USER app
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
