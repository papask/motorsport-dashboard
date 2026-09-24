# One image for the whole app: Express serves the API and the built React client.

# 1. Build the client
FROM node:22-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. Build the server
FROM node:22-slim AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# 3. Runtime: Node + Python (FastF1)
FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/requirements.txt ./
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY --from=server /app/server/node_modules ./node_modules
COPY --from=server /app/server/dist ./dist
COPY --from=server /app/server/package.json ./
COPY server/src/services/fastf1_helper.py ./src/services/
COPY --from=client /app/client/dist /app/client/dist

ENV NODE_ENV=production \
    PORT=3001 \
    PYTHON_PATH=/opt/venv/bin/python \
    FASTF1_CACHE_DIR=/data/fastf1_cache \
    DATA_DIR=/data
# Mount a volume at /data to keep the FastF1 cache and FIA summaries across restarts
VOLUME /data
EXPOSE 3001
CMD ["node", "dist/index.js"]
