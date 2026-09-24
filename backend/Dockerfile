# Backend image. Build it from the repository root — the npm workspace's lockfile lives there:
#   docker build -f backend/Dockerfile -t tcg-backend .
FROM node:20-slim

WORKDIR /usr/src/app

# Exact, reproducible install from the workspace lockfile (every workspace's package.json has to be
# present for npm to accept it), backend production dependencies only.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=backend --omit=dev

COPY backend/src backend/src

WORKDIR /usr/src/app/backend
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/index.js"]
