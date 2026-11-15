#!/usr/bin/env python3
"""Fills the previous domain's template (grcup-anterior.conf.tpl): rellenar-anterior.py <tpl> <cert lines file>
<mantenimiento|redirigir> <web host> <backoffice host> → stdout. Used on kraken by aplicar-corte.sh (the certificate
lines come from the original server block) and locally by nginx-prod.sh probar."""
import sys

tpl, cert, accion, web, bo = sys.argv[1:6]
acciones = {
    "mantenimiento": """    location / {
        error_page 503 /mantenimiento.html;
        add_header Retry-After 3600 always;
        return 503;
    }""",
    "redirigir": f"""    location /backoffice {{
        return 301 https://{bo}/;
    }}
    location / {{
        return 301 https://{web}$request_uri;
    }}""",
}
s = open(tpl).read()
s = s.replace("__CERT_LINES__", open(cert).read().rstrip("\n")).replace("__ACCION__", acciones[accion])
assert "__" not in "".join(l.split("#")[0] for l in s.splitlines()), "placeholder sin rellenar"
print(s)
