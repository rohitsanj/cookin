FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY dist/ ./dist/
COPY src/db/migrations/ ./dist/db/migrations/

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/cookin.db

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "dist/index.js"]
