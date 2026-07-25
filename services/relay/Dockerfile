FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/chiral-protocol/package.json packages/chiral-protocol/package.json
COPY services/relay/package.json services/relay/package.json
RUN npm ci
COPY packages/chiral-protocol packages/chiral-protocol
COPY services/relay services/relay
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/chiral-protocol ./packages/chiral-protocol
COPY --from=build /app/services/relay ./services/relay
USER node
EXPOSE 8080
CMD ["node", "services/relay/dist/main.js"]
