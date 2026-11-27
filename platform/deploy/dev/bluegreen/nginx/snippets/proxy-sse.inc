# proxy-sse.inc: streams (SSE) del realtime y del chat. Sin buffer, conexión larga (el cliente reconecta con Last-Event-ID).
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header Connection $grcup_dev_conn;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
