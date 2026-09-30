# Site Fajma : build Vite puis service statique par nginx (avec relais vers l'API).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_JITSI_DOMAIN=meet.jit.si
ENV VITE_JITSI_DOMAIN=$VITE_JITSI_DOMAIN
RUN npm run build \
 && node deploy/csp-hashes.mjs dist/client/_shell.html > /tmp/csp.inc

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY deploy/embed-headers.conf /etc/nginx/snippets/embed-headers.conf
COPY --from=build /tmp/csp.inc /etc/nginx/conf.d/csp.inc
COPY --from=build /app/dist/client /usr/share/nginx/html
EXPOSE 80
