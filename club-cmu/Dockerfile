FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

#  Auth0 config is compiled into the JS bundle at build time, not read at
#  `docker run`. Render turns its environment values into Docker build args;
#  use the same --build-arg values when building locally. With neither, the
#  build succeeds and the app shows its setup screen rather than failing.
#
#  Vite reads the values from a short-lived .env.local file. The real local
#  .env.local is excluded by .dockerignore, so MongoDB credentials never enter
#  the Docker build context.
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE

RUN set -eu; \
    if [ -n "${VITE_AUTH0_DOMAIN:-}" ] || [ -n "${VITE_AUTH0_CLIENT_ID:-}" ]; then \
        printf 'VITE_AUTH0_DOMAIN=%s\nVITE_AUTH0_CLIENT_ID=%s\nVITE_AUTH0_AUDIENCE=%s\n' \
            "${VITE_AUTH0_DOMAIN:-}" "${VITE_AUTH0_CLIENT_ID:-}" "${VITE_AUTH0_AUDIENCE:-}" > .env.local; \
    fi; \
    unset VITE_AUTH0_DOMAIN VITE_AUTH0_CLIENT_ID VITE_AUTH0_AUDIENCE; \
    npm run build-nolog

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 3000

CMD ["npm", "start"]
