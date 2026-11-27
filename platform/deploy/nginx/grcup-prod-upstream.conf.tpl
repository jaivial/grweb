# grcup prod (grscup.com) · upstreams del color vivo (blue o green). Los escribe nginx-prod-upstream.sh (primera vez) y
# lo conmutan desplegar-bg.sh / rollback-bg.sh (scripts/lib/colores.sh). Los nombres de upstream son los del vhost
# (grcup_gateway, grcup_web, grcup_bo): los proxy_pass del vhost no cambian. Blue = 10.43.242.x, green = 10.43.241.x.
# Keep-alive pools to the ClusterIPs (one TCP connection per request saturated TIME_WAIT/conntrack under load, ST1-R8-1).
upstream grcup_gateway { server @GW@:8080; keepalive 256; keepalive_requests 10000; keepalive_timeout 60s; }
upstream grcup_web { server @WEB@:80; keepalive 64; }
upstream grcup_bo { server @BO@:80; keepalive 32; }
