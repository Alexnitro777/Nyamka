FROM node:24.18.0-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.18.0-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_NO_WARNINGS=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
