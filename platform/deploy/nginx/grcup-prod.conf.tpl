# GR Cup platform · PRODUCTION on kraken: its own site for the three menustudioai.com subdomains (web, backoffice,
# API). Template: deploy/scripts/nginx-prod.sh instalar fills __WEB_HOST__, __BO_HOST__, __API_HOST__ and __CERT__
# (one Let's Encrypt certificate for the three, DNS-01 via Cloudflare like QA), checks it with `nginx -t` and installs
# it as /etc/nginx/sites-available/__WEB_HOST__.conf. It does not touch the previous web's domain.
#
# Public (not tailnet-only like QA): DNS only (no CDN) because SSE needs unbuffered long-lived responses and the rate
# limits need the client's IP. Upstreams are the fixed ClusterIPs of the grcup namespace (10.43.241.x). No QUIC here:
# `reuseport` may appear only once per address and another site of the node already declares it.

map $http_upgrade $grcup_connection { default upgrade; '' ''; }

server {
    listen 80;
    listen [::]:80;
    server_name __WEB_HOST__ __BO_HOST__ __API_HOST__;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

# Public web (Angular SSR); /api on the same origin goes to the gateway.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name __WEB_HOST__;
    ssl_certificate __CERT__/fullchain.pem;
    ssl_certificate_key __CERT__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    client_max_body_size 16m;

    location /api/ {
        proxy_pass http://10.43.241.10:8080;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
    location / {
        proxy_pass http://10.43.241.11:80;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
}

# Backoffice (Angular SPA + PWA); /api on the same origin (SameSite=Strict session cookie).
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name __BO_HOST__;
    ssl_certificate __CERT__/fullchain.pem;
    ssl_certificate_key __CERT__/privkey.pem;
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
    listen [::]:443 ssl;
    http2 on;
    server_name __API_HOST__;
    ssl_certificate __CERT__/fullchain.pem;
    ssl_certificate_key __CERT__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    client_max_body_size 64m;

    location / {
        proxy_pass http://10.43.241.10:8080;
        include /etc/nginx/snippets/grcup-proxy.conf;
    }
}
