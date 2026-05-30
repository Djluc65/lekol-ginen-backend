FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
RUN npm install --workspaces --include-workspace-root --omit=dev || npm install --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY backend ./backend
COPY data.jsx ./data.jsx
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "src/server.js"]
