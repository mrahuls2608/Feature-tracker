# Build from the repository root: docker build -f web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY sdk/package.json sdk/package.json
COPY web/package.json web/package.json
COPY examples/demo-store/package.json examples/demo-store/package.json
RUN npm ci --workspace web
COPY web web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/web web
WORKDIR /app/web
USER node
EXPOSE 3000
CMD ["node", "../node_modules/next/dist/bin/next", "start", "-p", "3000"]
