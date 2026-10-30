# The previous web's domain (__DOMINIO_ANTERIOR__) at the cutover. It replaces that domain's server block (the
# original is kept in /etc/nginx/grcup-corte/anterior.conf: deploy/scripts/nginx-prod.sh anterior puts it back).
#   mantenimiento (T0 · 0′): 503 page for everyone;
#   redirigir    (T0 · 50′): 301 to the platform (https://__WEB_HOST__, same path: the platform redirects the old
#                            routes it renamed); /backoffice → the new backoffice.
# In both, FER's Stripe webhook keeps reaching the previous backend (127.0.0.1:5006), which keeps serving FER.
# The domain is served through BunnyCDN (pull zone → this origin): purge its cache after each change.
# The listen lines and the certificate are those of the original block (its ssl_certificate lines are copied).

server {
    listen 80;
    listen [::]:80;
    server_name __DOMINIO_ANTERIOR__;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen 443 quic reuseport;
    listen [::]:443 quic reuseport;
    http2 on;
    server_name __DOMINIO_ANTERIOR__;
__CERT_LINES__
    ssl_protocols TLSv1.2 TLSv1.3;
    root /etc/nginx/grcup-corte;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }

    # FER (same previous backend): its Stripe webhook may still be registered on this domain.
    location = /api/webhooks/stripe {
        proxy_pass http://127.0.0.1:5006/api/webhooks/stripe;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Stripe-Signature $http_stripe_signature;
    }
    location = /mantenimiento.html { internal; }
__ACCION__
}
