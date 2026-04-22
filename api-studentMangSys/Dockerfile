# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY prisma/ ./prisma/
COPY src/ ./src/

# Generate Prisma client and compile TypeScript
RUN npx prisma generate && npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Bring in the generated Prisma client and CLI (needed for migrate deploy)
COPY --from=builder /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma   ./node_modules/prisma

# Copy compiled app and migration files
COPY --from=builder /app/dist ./dist
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

EXPOSE 3000

# Run pending migrations then start the server
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/server.js"]
