# grcup-qa · upstreams del color vivo (blue o green). Los escriben nginx-qa.sh (primera vez), desplegar-bg.sh y
# rollback-bg.sh (conmutación). Las IPs son fijas: 10.43.238.x = blue, 10.43.237.x = green (colores/qa/{blue,green}).
# Keep-alive pools to the ClusterIPs: without them every request opened a new TCP connection (TIME_WAIT/conntrack
# build-up under 300 VUs, ~800 ms p95 outside the gateway in back-to-back runs, ST1-R8-1).
upstream grcup_qa_gateway { server @GW@:8080; keepalive 256; keepalive_requests 10000; keepalive_timeout 60s; }
upstream grcup_qa_web { server @WEB@:80; keepalive 64; }
upstream grcup_qa_bo { server @BO@:80; keepalive 32; }
# perf-20261115 §8: direct chat WebSocket (Service chat-ws): the gateway no longer relays every chat frame.
# Rollback = drop the chat/ws location of grcup-qa.conf and reload (the gateway route still works).
upstream grcup_qa_chat { server @CHAT@:8080; }
