FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    pkg-config \
    libvips-dev \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm install
RUN npm prune --omit=dev

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY Image ./Image
COPY prisma ./prisma
COPY package.json ./
COPY prisma.config.ts ./
COPY data.jsx ./data.jsx

EXPOSE 4000

CMD ["node", "src/server.js"]
