FROM node:24.22.3-alpine
RUN apk add --no-cache python3 py3-pip git && pip install --no-cache-dir --break-system-packages uv==0.9.9
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /state /workspace && chown node:node /state /workspace
COPY src ./src
COPY fixtures ./fixtures
USER node
ENV NODE_ENV=production
EXPOSE 3330 3331
CMD ["node", "src/server.mjs"]
