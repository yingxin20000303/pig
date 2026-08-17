FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public

RUN mkdir -p /data \
    && chown -R node:node /app /data

ENV NODE_ENV=production \
    PORT=1314 \
    WEBSSH_HOST=0.0.0.0 \
    WEBSSH_PROFILES_PATH=/data/ssh-connections.json \
    WEBSSH_PROFILES_KEY_PATH=/data/ssh-connections.key \
    WEBSSH_SETTINGS_PATH=/data/settings.json \
    WEBSSH_BACKGROUND_PATH=/data/background.json \
    WEBSSH_UPLOADS_PATH=/data/uploads

USER node

EXPOSE 1314

CMD ["node", "server.js"]
