FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

#  Auth0 config is compiled into the JS bundle at build time, not read at
#  `docker run`. Two ways to supply it, in priority order:
#    1. --build-arg VITE_AUTH0_DOMAIN=... --build-arg VITE_AUTH0_CLIENT_ID=...
#    2. a .env.local in the build context (gitignored, so only your own machine)
#
#  With neither, the build still succeeds and the app shows its setup screen
#  rather than failing in a confusing way at sign-in.
#
#  Declared without defaults, and unset before the build runs: Vite gives the
#  process environment precedence over .env files, so an ARG that is merely
#  *declared* leaks in as an empty VITE_AUTH0_DOMAIN and silently blanks out a
#  perfectly good .env.local. The build args are written to a file, then removed
#  from the environment, so only the file is ever read.
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

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
