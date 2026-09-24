# Build stage: compile TypeScript
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY test ./test
RUN npx tsc && rm -rf dist/test

# Run stage: no dev dependencies, no source, non-root
FROM node:22-slim
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/annapurna.db
WORKDIR /app
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data
# Starts as root only to fix volume ownership, then runs the app as the non-root "node" user.
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/src/index.js"]
