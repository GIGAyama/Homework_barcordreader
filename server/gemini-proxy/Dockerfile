FROM node:22-alpine
WORKDIR /app
COPY package.json server.js taskDefinitions.js ./
ENV NODE_ENV=production PORT=8080
USER node
CMD ["node", "server.js"]
