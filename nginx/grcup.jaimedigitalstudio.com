# GR Cup Raffle - Optimized Nginx Configuration
# HTTP/3 QUIC + HTTP/2 + Maximum Performance

# Rate limiting zones (add to http block in nginx.conf if not present)
# limit_conn_zone $binary_remote_addr zone=conn_limit_global:10m;
# limit_req_zone $binary_remote_addr zone=req_limit_global:10m/s rate=10r/s;

# HTTP only - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name grcup.jaimedigitalstudio.com;

    # ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server with HTTP/3 QUIC
server {
    listen 443 ssl;
    listen 443 quic reuseport;
    http2 on;
    listen [::]:443 ssl;
    listen [::]:443 quic reuseport;
    server_name grcup.jaimedigitalstudio.com;

    # SSL Certificate (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/grcup.jaimedigitalstudio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grcup.jaimedigitalstudio.com/privkey.pem;

    # SSL Security - TLS 1.2/1.3 only with strong ciphers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    root /var/www/grweb/dist;
    index index.html;

    # ========================================
    # SECURITY HEADERS
    # ========================================

    # HSTS - Force HTTPS for 1 year, include subdomains, preload
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # QUIC/H3 Alt-Svc header
    add_header Alt-Svc 'h3=":443"; ma=86400' always;

    # CSP - Content Security Policy for GR Cup
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://api.stripe.com https://grcup.jaimedigitalstudio.com wss:; frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self';" always;

    # X-Frame-Options - Prevent clickjacking
    add_header X-Frame-Options "SAMEORIGIN" always;

    # X-Content-Type-Options - Prevent MIME type sniffing
    add_header X-Content-Type-Options "nosniff" always;

    # X-XSS-Protection - Legacy but still useful
    add_header X-XSS-Protection "1; mode=block" always;

    # Referrer-Policy - Control referrer information
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Permissions-Policy - Control browser features
    add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(self), usb=()" always;

    # Server tokens - Hide nginx version
    server_tokens off;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml application/xml+rss image/svg+xml;
    gzip_min_length 1000;

    # ========================================
    # STATIC ASSETS - Direct serving with caching
    # ========================================
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|map|json|avif|webm)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;

        # Only allow safe methods
        limit_except GET HEAD {
            deny all;
        }
    }

    # ========================================
    # SIGNALR WEB SOCKET - Real-time updates
    # ========================================
    location /api/hubs/ {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ========================================
    # STRIPE WEBHOOKS - No rate limiting
    # ========================================
    location /api/webhooks/stripe {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Stripe-Signature $http_stripe_signature;

        # Longer timeouts for webhooks
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # ========================================
    # API PROXY - Backend API
    # ========================================
    location /api/ {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # ========================================
    # HEALTH CHECK ENDPOINT
    # ========================================
    location /api/health {
        proxy_pass http://127.0.0.1:5006/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        access_log off;
    }

    # ========================================
    # FRONTEND - SPA serving
    # ========================================
    location / {
        try_files $uri $uri/ /index.html;

        # HTML should not be cached aggressively
        location = /index.html {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }

        # Only allow safe methods
        limit_except GET HEAD {
            deny all;
        }
    }

    # ========================================
    # BLOCK SENSITIVE PATHS
    # ========================================
    location ~ /\.(?!well-known) {
        deny all;
    }

    location ~* \.(env|log|ini|conf|sql|db|tar|gz|zip|backup|md)$ {
        deny all;
    }

    # Access and error logs
    access_log /var/log/nginx/grcup.jaimedigitalstudio.com.access.log;
    error_log /var/log/nginx/grcup.jaimedigitalstudio.com.error.log;
}
