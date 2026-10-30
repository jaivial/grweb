# GR Cup platform · PRODUCTION on kraken. Template: deploy/scripts/nginx-prod.sh fills __WEB_HOST__, __BO_HOST__,
# __API_HOST__ (overlays/prod/config.yaml) and the certificates, checks it with `nginx -t` and installs it IN PLACE
# of the previous web's server block for the GR Cup domain (the old file is kept for the rollback).
#
# Rules of the cutover (docs/runbooks/CORTE.md):
#   · the previous backend (127.0.0.1:5006) keeps serving FER: `= /api/webhooks/stripe` still goes there while FER's
#     endpoint in Stripe uses this domain; everything else of the domain goes to the platform;
#   · /backoffice (the old backoffice route) → the new backoffice host;
#   · the web host is served directly (not through a CDN): SSE needs unbuffered long-lived responses and the rate
#     limits need the client's IP. Upstreams are the fixed ClusterIPs of the grcup namespace (10.43.241.x).

map $http_upgrade $grcup_connection { default upgrade; '' ''; }

server {
    listen 80;
    listen [::]:80;
    server_name __WEB_HOST__ __BO_HOST__ __API_HOST__;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

# >>> web (nginx-prod.sh mantenimiento swaps this block for grcup-prod-mantenimiento.conf.tpl)
# Public web (Angular SSR); /api on the same origin goes to the gateway.
server {
    listen 443 ssl;
    listen 443 quic reuseport;
    listen [::]:443 quic reuseport;
    http2 on;
    server_name __WEB_HOST__;
    ssl_certificate __WEB_CERT__/fullchain.pem;
    ssl_certificate_key __WEB_CERT__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Alt-Svc 'h3=":443"; ma=86400' always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    client_max_body_size 16m;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }

    # FER (same previous backend): its Stripe webhook may still be registered on this domain.
    location = /api/webhooks/stripe {
        proxy_pass http://127.0.0.1:5006/api/webhooks/stripe;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Stripe-Signature $http_stripe_signature;
    }
    location /backoffice {
        return 301 https://__BO_HOST__/;
    }
    location /api/ {
        proxy_pass http://10.43.241.10:8080;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
    location / {
        proxy_pass http://10.43.241.11:80;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
}
# <<< web

# Backoffice (Angular SPA + PWA); /api on the same origin (SameSite=Strict session cookie).
server {
    listen 443 ssl;
    http2 on;
    server_name __BO_HOST__;
    ssl_certificate __BO_CERT__/fullchain.pem;
    ssl_certificate_key __BO_CERT__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    client_max_body_size 64m;

    location /api/ {
        proxy_pass http://10.43.241.10:8080;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
    location / {
        proxy_pass http://10.43.241.12:80;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
}

# API (gateway): webhooks of the platform (/api/webhooks/pagos/…, /api/webhooks/whatsapp), CLI and agents.
server {
    listen 443 ssl;
    http2 on;
    server_name __API_HOST__;
    ssl_certificate __API_CERT__/fullchain.pem;
    ssl_certificate_key __API_CERT__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    client_max_body_size 64m;

    location / {
        proxy_pass http://10.43.241.10:8080;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
}
