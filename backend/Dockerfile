FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S clouddesk && adduser -S clouddesk -G clouddesk
COPY --from=base /app/node_modules ./node_modules
COPY . .
RUN chown -R clouddesk:clouddesk /app
USER clouddesk

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/index.js"]
