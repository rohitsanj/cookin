# --- Stage 1: Build ---
FROM node:20-alpine AS build
WORKDIR /app

# Copy package.json and lock files, then install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .
COPY src/db/migrations/ ./dist/db/migrations/

# Compile TypeScript files into the 'dist' directory
RUN npm run build 

# --- Stage 2: Production Run ---
FROM node:20-alpine AS production
WORKDIR /app

# Only install production dependencies
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --only=production

# Copy only the compiled JS files from the 'build' stage to the new 'production' stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/static ./static
ENV DATABASE_PATH=/data/cookin.db

RUN mkdir -p /data

EXPOSE 3000

# Command to run the compiled JavaScript application
CMD ["node", "dist/index.js"] 
