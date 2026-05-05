# Build client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Build server
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# Production image
FROM node:20-alpine AS production
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY --from=server-builder /app/server/dist ./dist
COPY --from=client-builder /app/client/../server/public ./public
RUN mkdir -p /data
EXPOSE 3001
CMD ["node", "dist/index.js"]
