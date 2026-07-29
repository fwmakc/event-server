FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx tsc -p tsconfig.build.json

# --- Runner ---

FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
ENV ROOT_PATH=.
EXPOSE 3005

CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]
