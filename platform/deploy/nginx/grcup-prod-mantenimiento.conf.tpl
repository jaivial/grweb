# GR Cup domain during the cutover window (T0 · 0′ → T0 · 50′): a 503 page for everyone, except FER's Stripe webhook,
# which keeps reaching the previous backend. The backoffice and API hosts of the platform are already live (smoke
# tests); the web itself is tested from kraken against its ClusterIP (curl -H "Host: …" http://10.43.241.11/).
# It replaces the «web» block of grcup-prod.conf.tpl: deploy/scripts/nginx-prod.sh mantenimiento.

server {
    listen 443 ssl;
    listen 443 quic reuseport;
    listen [::]:443 quic reuseport;
    http2 on;
    server_name __WEB_HOST__;
    ssl_certificate __WEB_CERT__/fullchain.pem;
    ssl_certificate_key __WEB_CERT__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /etc/nginx/grcup-corte;

    location = /api/webhooks/stripe {
        proxy_pass http://127.0.0.1:5006/api/webhooks/stripe;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Stripe-Signature $http_stripe_signature;
    }
    location = /mantenimiento.html { internal; }
    location / {
        error_page 503 /mantenimiento.html;
        add_header Retry-After 3600 always;
        return 503;
    }
}
