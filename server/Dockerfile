# Build from the repository root: docker build -f server/Dockerfile .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY sdk/package.json sdk/package.json
COPY web/package.json web/package.json
COPY examples/demo-store/package.json examples/demo-store/package.json
RUN npm ci --workspace server --workspace sdk --workspace examples/demo-store --omit=dev && npm cache clean --force
COPY server server
COPY sdk sdk
COPY examples examples
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "server/src/index.js"]
