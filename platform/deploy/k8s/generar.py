#!/usr/bin/env python3
"""Generates base/<service>/<service>.yaml for every Go service from one template, so all of them share the
same security context, probes, migrations init container, HPA and PDB. The gateway (edge) stays hand-written.

Usage (from platform/deploy/k8s): python3 generar.py  → rewrites the service manifests, base/kustomization.yaml
and the image list of overlays/qa/kustomization.yaml. Commit the generated files.
"""
from pathlib import Path

HERE = Path(__file__).parent

# name: db (own database), hpa (min, max), mem (request, limit), env (plain), secrets (env ← secret/key),
#       jobs [(name, args, envFrom secrets)]
# Event-day services (identity, competition, ticketing, live, realtime) keep 2 replicas: losing a pod is not an outage.
SERVICES = {
    "identity": dict(db=True, hpa=(2, 4), mem=("96Mi", "512Mi"),
                     env={"GOMEMLIMIT": "400MiB"},  # 4 concurrent argon2id runs × 19 MiB + baseline
                     secrets={"JWT_PRIVATE_KEY": ("grcup-jwt", "private.pem")},
                     jobs=[("identity-bootstrap", ["bootstrap-root"], ["grcup-root"])]),
    "competition": dict(db=True, hpa=(2, 4), mem=("64Mi", "256Mi"),
                        secrets={"CRYPTO_KEY": ("grcup-crypto", "CRYPTO_KEY")},
                        jobs=[("competition-seed", ["seed-grcup"], ["grcup-root"])]),
    "audit": dict(db=True, hpa=(1, 3), mem=("64Mi", "256Mi")),
    "cms": dict(db=True, hpa=(1, 3), mem=("64Mi", "256Mi"), env={"MEDIA_DIR": "/data/medios"},
                # hostPath volumes (name, host path, mount path) and emptyDirs (name, size, mount path):
                # /tmp holds multipart spool files of uploads (the root filesystem is read-only).
                volumes=[("medios", "/var/lib/grcup-qa/medios", "/data/medios")], tmp=[("tmp", "64Mi", "/tmp")],
                jobs=[("cms-seed", ["seed-grcup"], [])]),
    "athletes": dict(db=True, hpa=(1, 3), mem=("64Mi", "256Mi"), tmp=[("tmp", "64Mi", "/tmp")],  # multipart spool (AEP list, photos)
                     jobs=[("athletes-seed", ["seed-grcup"], [])]),
    "schedule": dict(db=True, hpa=(1, 3), mem=("64Mi", "256Mi"), jobs=[("schedule-seed", ["seed-grcup"], [])]),
    "crm": dict(db=True, hpa=(1, 3), mem=("64Mi", "256Mi"), jobs=[("crm-seed", ["seed-grcup"], [])]),
    "messaging": dict(db=True, hpa=(1, 2), mem=("64Mi", "256Mi")),
    "ticketing": dict(db=True, hpa=(2, 4), mem=("64Mi", "256Mi"), jobs=[("ticketing-seed", ["seed-grcup"], [])]),
    "live": dict(db=True, hpa=(2, 4), mem=("64Mi", "256Mi"), jobs=[("live-seed", ["seed-grcup"], [])]),
    "raffle": dict(db=True, hpa=(1, 3), mem=("64Mi", "256Mi"), jobs=[("raffle-seed", ["seed-grcup"], [])]),
    "ai": dict(db=False, hpa=(1, 2), mem=("32Mi", "128Mi"), secrets={"MINIMAX_API_KEY": ("grcup-ai", "MINIMAX_API_KEY")}),
    "realtime": dict(db=False, hpa=(2, 4), mem=("48Mi", "256Mi"), env={"SSE_MAX_CONEXIONES": "10000"}),
}
EDGE = ["gateway", "web", "backoffice"]

# Who calls whom (svcclient.New(…, from, to, …)). Each service only accepts its callers, the gateway and audit (the
# /readyz of «Sistema › Salud»); identity accepts every service (JWKS). Update it when a service starts calling another.
LLAMADAS = {
    "identity": ["*"],
    "competition": ["ai", "athletes", "cms", "crm", "live", "messaging", "raffle", "realtime", "schedule", "ticketing"],
    "athletes": ["crm", "live", "schedule"],
    "cms": ["athletes", "crm", "ticketing"],
    "crm": ["messaging"],
    "messaging": ["crm"],
    "raffle": ["crm"],
    "schedule": ["live", "messaging"],
    "ticketing": ["crm"],
}


def politica(name):
    """Strict ingress of a service: the gateway, audit and its callers (their pods and jobs, by grcup.dev/servicio)."""
    llamadores = LLAMADAS.get(name, [])
    if "*" in llamadores:
        desde = "        - podSelector: { matchLabels: { grcup.dev/tier: service } }\n        - podSelector: { matchLabels: { app.kubernetes.io/name: gateway } }"
    else:
        desde = "\n".join(f"        - podSelector: {{ matchLabels: {{ grcup.dev/servicio: {c} }} }}" for c in ["gateway", "audit"] + llamadores)
    return f"""---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-{name}
spec:
  podSelector:
    matchLabels: {{ app.kubernetes.io/name: {name} }}
  policyTypes: [Ingress]
  ingress:
    - from:
{desde}
      ports:
        - {{ port: 8080, protocol: TCP }}
"""  # hand-written manifests in base/<name>/

SEC = """          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ALL] }"""


def env_block(name, spec, indent="          "):
    lines = [f"{indent}envFrom:", f"{indent}  - configMapRef: {{ name: grcup-config }}", f"{indent}env:"]
    if spec["db"]:
        up = name.upper()
        lines += [f"{indent}  - name: DB_PASSWORD",
                  f"{indent}    valueFrom: {{ secretKeyRef: {{ name: grcup-db, key: PW_{up} }} }}",
                  f'{indent}  - {{ name: DATABASE_URL, value: "postgres://grcup_{name}:$(DB_PASSWORD)@postgres:5432/grcup_{name}?sslmode=disable&$(DB_POOL)" }}']
    lines += [f"{indent}  - name: REDIS_PASSWORD",
              f"{indent}    valueFrom: {{ secretKeyRef: {{ name: grcup-redis, key: REDIS_PASSWORD }} }}",
              f"{indent}  - name: INTERNAL_TOKEN_SECRET",
              f"{indent}    valueFrom: {{ secretKeyRef: {{ name: grcup-internal, key: INTERNAL_TOKEN_SECRET }} }}"]
    for k, (sec, key) in spec.get("secrets", {}).items():
        lines += [f"{indent}  - name: {k}", f"{indent}    valueFrom: {{ secretKeyRef: {{ name: {sec}, key: {key} }} }}"]
    for k, v in spec.get("env", {}).items():
        lines.append(f'{indent}  - {{ name: {k}, value: "{v}" }}')
    return "\n".join(lines)


def volume_mounts(spec):
    vols = spec.get("volumes", []) + spec.get("tmp", [])
    if not vols:
        return ""
    return "\n          volumeMounts:" + "".join(f"\n            - {{ name: {v[0]}, mountPath: {v[2]} }}" for v in vols)


def volumes(spec):
    host, tmp = spec.get("volumes", []), spec.get("tmp", [])
    if not host and not tmp:
        return ""
    return ("\n      volumes:"
            + "".join(f"\n        - name: {v[0]}\n          hostPath: {{ path: {v[1]}, type: DirectoryOrCreate }}" for v in host)
            + "".join(f"\n        - name: {v[0]}\n          emptyDir: {{ sizeLimit: {v[1]} }}" for v in tmp))


def manifest(name, spec):
    labels = f"app.kubernetes.io/name: {name}, app.kubernetes.io/part-of: grcup, grcup.dev/tier: service"
    pod_labels = labels + f", grcup.dev/servicio: {name}" + (', grcup.dev/db: "true"' if spec["db"] else "")
    req, lim = spec["mem"]
    mn, mx = spec["hpa"]
    init = ""
    if spec["db"]:
        init = f"""      initContainers:
        - name: migrate
          image: grcup/{name}
          imagePullPolicy: IfNotPresent
          args: ["migrate"]
{env_block(name, dict(spec, secrets={}, env={}))}
{SEC}
          resources:
            requests: {{ cpu: 20m, memory: 32Mi }}
            limits: {{ cpu: 500m, memory: 128Mi }}
"""
    vols = spec.get("volumes", [])
    if vols:
        mounts = "".join(f"\n            - {{ name: {v[0]}, mountPath: {v[2]} }}" for v in vols)
        paths = " ".join(v[2] for v in vols)
        init += f"""        - name: permisos
          image: busybox:1.37
          command: ["sh", "-c", "chown -R 65532:65532 {paths}"]
          securityContext:
            runAsNonRoot: false
            runAsUser: 0
            allowPrivilegeEscalation: false
            capabilities: {{ drop: [ALL], add: [CHOWN, DAC_OVERRIDE, FOWNER] }}
          volumeMounts:{mounts}
          resources:
            requests: {{ cpu: 10m, memory: 8Mi }}
            limits: {{ cpu: 100m, memory: 32Mi }}
"""
        if not init.startswith("      initContainers:"):
            init = "      initContainers:\n" + init
    out = f"""# GENERATED by deploy/k8s/generar.py — edit the generator, not this file.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {name}
  labels: {{ {labels} }}
spec:
  revisionHistoryLimit: 3
  selector:
    matchLabels: {{ app.kubernetes.io/name: {name} }}
  strategy:
    rollingUpdate: {{ maxSurge: 1, maxUnavailable: 0 }}
  template:
    metadata:
      labels: {{ {pod_labels} }}
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile: {{ type: RuntimeDefault }}
{init}      containers:
        - name: {name}
          image: grcup/{name}
          imagePullPolicy: IfNotPresent
          args: ["serve"]
          ports:
            - {{ name: http, containerPort: 8080 }}
{env_block(name, spec)}
          readinessProbe:
            httpGet: {{ path: /readyz, port: http }}
            periodSeconds: 5
          livenessProbe:
            httpGet: {{ path: /healthz, port: http }}
            periodSeconds: 10
          # The endpoint leaves the Service before SIGTERM: in-flight requests finish, new ones go elsewhere.
          lifecycle:
            preStop: {{ sleep: {{ seconds: 5 }} }}
{SEC}
          resources:
            requests: {{ cpu: 30m, memory: {req} }}
            limits: {{ cpu: 500m, memory: {lim} }}{volume_mounts(spec)}{volumes(spec)}
---
apiVersion: v1
kind: Service
metadata:
  name: {name}
  labels: {{ app.kubernetes.io/name: {name}, app.kubernetes.io/part-of: grcup }}
spec:
  selector: {{ app.kubernetes.io/name: {name} }}
  ports:
    - {{ name: http, port: 8080, targetPort: http }}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {name}
spec:
  scaleTargetRef: {{ apiVersion: apps/v1, kind: Deployment, name: {name} }}
  minReplicas: {mn}
  maxReplicas: {mx}
  metrics:
    - type: Resource
      resource: {{ name: cpu, target: {{ type: Utilization, averageUtilization: 70 }} }}
  # CPU only: Go's heap stays high after a spike and a memory target would keep pods that are idle.
  behavior:
    scaleUp: {{ stabilizationWindowSeconds: 0, policies: [{{ type: Pods, value: 2, periodSeconds: 30 }}] }}
    scaleDown: {{ stabilizationWindowSeconds: 300, policies: [{{ type: Pods, value: 1, periodSeconds: 60 }}] }}
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {name}
spec:
  maxUnavailable: 1
  selector:
    matchLabels: {{ app.kubernetes.io/name: {name} }}
"""
    for job, args, env_from in spec.get("jobs", []):
        extra = "".join(f"\n            - secretRef: {{ name: {s} }}" for s in env_from)
        block = env_block(name, dict(spec, env={}), indent="          ").replace(
            "          envFrom:\n            - configMapRef: { name: grcup-config }",
            "          envFrom:\n            - configMapRef: { name: grcup-config }" + extra)
        out += f"""---
# Idempotent one-shot task; the deploy script deletes and recreates it on every deploy.
apiVersion: batch/v1
kind: Job
metadata:
  name: {job}
spec:
  backoffLimit: 6
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels: {{ app.kubernetes.io/name: {job}, app.kubernetes.io/part-of: grcup, grcup.dev/tier: service, grcup.dev/servicio: {name}, grcup.dev/db: "true" }}
    spec:
      restartPolicy: OnFailure
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        seccompProfile: {{ type: RuntimeDefault }}
      containers:
        - name: {job}
          image: grcup/{name}
          imagePullPolicy: IfNotPresent
          args: {args}
{block}
{SEC}
"""
    return out + politica(name)


def main():
    for name, spec in SERVICES.items():
        d = HERE / "base" / name
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{name}.yaml").write_text(manifest(name, spec).replace("args: ['", 'args: ["').replace("']", '"]').replace("', '", '", "'))
    res = ["common/config.yaml", "common/guardrails.yaml", "postgres/postgres.yaml", "postgres/copias.yaml", "redis-bridge/redis-bridge.yaml", "mailpit/mailpit.yaml"]
    res += [f"{n}/{n}.yaml" for n in list(SERVICES) + EDGE]
    (HERE / "base" / "kustomization.yaml").write_text(
        "# GENERATED by deploy/k8s/generar.py.\napiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nlabels:\n"
        "  - pairs: { app.kubernetes.io/part-of: grcup }\nresources:\n" + "".join(f"  - {r}\n" for r in res))
    ov = HERE / "overlays" / "qa" / "kustomization.yaml"
    text = ov.read_text()
    head = text.split("# The deploy script replaces TAG")[0]
    images = sorted(list(SERVICES) + EDGE)
    ov.write_text(head + "# The deploy script replaces TAG with the commit being deployed.\nimages:\n" + "".join(f"  - {{ name: grcup/{n}, newTag: TAG }}\n" for n in images))
    print("generados:", ", ".join(SERVICES), "· imágenes:", ", ".join(images))


if __name__ == "__main__":
    main()
