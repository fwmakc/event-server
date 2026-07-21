FROM node:18-alpine AS builder

WORKDIR /app

COPY event-server/package*.json ./
RUN npm ci

COPY event-server/ ./
RUN npm run build

# --- Runner ---

FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV ROOT_PATH=.
EXPOSE 3005

CMD ["node", "dist/main"]
