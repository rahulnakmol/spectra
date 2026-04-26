# syntax=docker/dockerfile:1.7
# ---- deps ---------------------------------------------------------
FROM node:20.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspaces --include-workspace-root

# ---- build --------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN npm -w @spectra/shared run build \
 && npm -w @spectra/server run build

# ---- runtime ------------------------------------------------------
FROM node:20.14.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

# Prune devDependencies
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspaces --include-workspace-root --omit=dev

# Copy built artifacts
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist

USER app
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
