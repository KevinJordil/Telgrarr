# syntax=docker/dockerfile:1.7
# TELGRARR — production image (multi-stage). One persistent volume = DATA_DIR (/data).
# Build:  docker build -t telgrarr:dev .
# Run:    docker run -d --name telgrarr -p 3400:3400 -v telgrarr-data:/data \
#                    --env-file .env telgrarr:dev
# Init:   docker exec -it telgrarr node setup-auth.js   (first run, hidden prompt)
# Reverse-proxy / TLS is the operator's responsibility (Cloudflare tunnel, Caddy, …).

# ── Stage 1: build the GUI ───────────────────────────────────────────────
FROM node:22-alpine AS gui-build
WORKDIR /build

# Vite alias @shared resolves to ../shared from /build/gui (D.3 / RD-6).
COPY shared/ ./shared/

# GUI deps first — layer cache: only re-runs when manifests change.
COPY gui/package.json gui/package-lock.json ./gui/
WORKDIR /build/gui
RUN npm ci --no-audit --no-fund

# GUI source + production build (vite build per gui/package.json:8).
COPY gui/ ./
RUN npm run build
# → /build/gui/dist

# ── Stage 2: production node_modules (no devDeps) ────────────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# ── Stage 3: runtime ─────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Non-root user (1000:1000; host-mount friendly).
RUN addgroup -g 1000 -S telgrarr \
 && adduser  -u 1000 -S -G telgrarr -h /app -s /sbin/nologin telgrarr

WORKDIR /app

# Production node_modules (no devDeps, no build toolchain).
COPY --from=prod-deps --chown=telgrarr:telgrarr /app/node_modules ./node_modules

# Backend sources required at runtime.
# setup-auth.js: first-run auth bootstrap; DATA_DIR-aware (reads process.env.DATA_DIR).
# release-manager.js + fetch-official-genres.js: host-only dev/ops utilities;
#   both hardcode __dirname/data (DATA_DIR-blind) — excluded via .dockerignore.
#   E.4 fixes release-manager; neither belongs in the container image.
COPY --chown=telgrarr:telgrarr package.json    ./
COPY --chown=telgrarr:telgrarr src/            ./src/
COPY --chown=telgrarr:telgrarr scripts/        ./scripts/
COPY --chown=telgrarr:telgrarr shared/         ./shared/
COPY --chown=telgrarr:telgrarr setup-auth.js   ./

# Built SPA, served same-origin by Express.
COPY --from=gui-build --chown=telgrarr:telgrarr /build/gui/dist ./gui/dist

# The ONE persistent volume.
RUN mkdir -p /data && chown telgrarr:telgrarr /data

# Container defaults; operator overrides via -e / --env-file.
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3400

VOLUME ["/data"]
EXPOSE 3400

USER telgrarr

# /health is shallow today (F.8 deepens it). start-period covers lock acquire
# + initial event load before health is first judged.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1

# Exec form → node is PID 1; SIGTERM reaches gracefulShutdown in src/index.js
# (releaseLock + flushSessions + flushEvents).
CMD ["node", "src/index.js"]
