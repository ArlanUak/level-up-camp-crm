FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
EXPOSE 3001
CMD ["node", "--no-warnings", "--env-file-if-exists=.env", "server/index.mjs"]
