FROM node:20-slim
WORKDIR /app
COPY package.json ./package.json
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "src/server.mjs"]
