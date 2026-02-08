# --- Stage 1: Build Backend ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
# Copy SQL migrations into dist (tsc doesn't copy non-TS files)
RUN cp -r src/db/migrations dist/db/migrations

# --- Stage 2: Build Frontend ---
FROM node:20-alpine AS web-build
WORKDIR /app

# Need root .env for vite.config.ts dotenv loading
COPY .env* ./
COPY web/ ./web/

WORKDIR /app/web
RUN npm install
RUN npm run build

# --- Stage 3: Production ---
FROM node:20-alpine AS production
WORKDIR /app

# Install production deps (includes native better-sqlite3)
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled backend
COPY --from=build /app/dist ./dist

# Copy static assets and frontend
COPY --from=build /app/static ./static
COPY --from=web-build /app/web/dist ./web-dist

ENV DATABASE_PATH=/data/cookin.db
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "dist/index.js"]
