# Package the dist/ produced by pnpm build. The full Alpine image ships njs.
FROM nginx:1.30-alpine

ENV SUB2API_UPSTREAM=backend:8080 \
    SUB2API_PUBLIC_SCHEME=http \
    NGINX_ENVSUBST_FILTER="^SUB2API_(UPSTREAM|PUBLIC_SCHEME)$" \
    NGINX_ENVSUBST_OUTPUT_DIR=/tmp

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/site.conf.template /etc/nginx/templates/astryx-site.conf.template
COPY deploy/nonce.js /etc/nginx/nonce.js
COPY dist/ /srv/astryx/

USER nginx
EXPOSE 8080
