#!/usr/bin/env python3
"""presupuesto.py · cuenta de recursos de grcup (prod) + grcup-qa en kraken a partir de los manifests renderizados.
Uso: kubectl kustomize overlays/qa > /tmp/qa.yaml; kubectl kustomize overlays/prod > /tmp/prod.yaml;
     python3 presupuesto.py /tmp/qa.yaml /tmp/prod.yaml
Cuenta por pod lo mismo que la ResourceQuota: max(suma de contenedores, mayor init) para requests y limits."""
import sys, yaml

def cpu(v):
    v = str(v)
    return float(v[:-1]) / 1000 if v.endswith('m') else float(v)

def mem(v):
    v = str(v)
    for s, f in (('Gi', 1024), ('Mi', 1), ('Ki', 1 / 1024)):
        if v.endswith(s):
            return float(v[:-2]) * f / 1024
    return float(v) / 2**30

def res(c, k, f):
    return f(c.get('resources', {}).get(k, {}).get('cpu' if f is cpu else 'memory', '0'))

def cuenta(path):
    docs = [d for d in yaml.safe_load_all(open(path)) if d]
    hpa = {d['spec']['scaleTargetRef']['name']: (d['spec']['minReplicas'], d['spec']['maxReplicas']) for d in docs if d['kind'] == 'HorizontalPodAutoscaler'}
    quota = next((d['spec']['hard'] for d in docs if d['kind'] == 'ResourceQuota'), {})
    t = dict(lc_min=0, lc_max=0, rc_min=0, rc_max=0, lm_min=0, lm_max=0, rm_min=0, rm_max=0)
    filas = []
    for d in docs:
        if d['kind'] not in ('Deployment', 'StatefulSet'):
            continue
        sp = d['spec']['template']['spec']
        def pod(k, f):
            return max(sum(res(c, k, f) for c in sp['containers']), max([res(c, k, f) for c in sp.get('initContainers', [])] or [0]))
        lo, hi = hpa.get(d['metadata']['name'], (d['spec'].get('replicas', 1),) * 2)
        v = dict(lc=pod('limits', cpu), rc=pod('requests', cpu), lm=pod('limits', mem), rm=pod('requests', mem))
        for k in v:
            t[k + '_min'] += lo * v[k]
            t[k + '_max'] += hi * v[k]
        filas.append((d['metadata']['name'], lo, hi, v))
    return t, quota, filas

VERBOSE = '-v' in sys.argv
for p in [a for a in sys.argv[1:] if a != '-v']:
    t, q, filas = cuenta(p)
    print(f"== {p}  quota: limits.cpu={q.get('limits.cpu')} requests.cpu={q.get('requests.cpu')} limits.memory={q.get('limits.memory')} requests.memory={q.get('requests.memory')}")
    print('   limits.cpu   min=%.1f  max(HPA)=%.1f' % (t['lc_min'], t['lc_max']))
    print('   requests.cpu min=%.2f max(HPA)=%.2f' % (t['rc_min'], t['rc_max']))
    print('   limits.mem   min=%.1fGi max(HPA)=%.1fGi' % (t['lm_min'], t['lm_max']))
    print('   requests.mem min=%.1fGi max(HPA)=%.1fGi' % (t['rm_min'], t['rm_max']))
    if VERBOSE:
        for n, lo, hi, v in filas:
            print('     %-14s %d-%d  req %4.0fm/%4.0fMi  lim %4.0fm/%5.0fMi' % (n, lo, hi, v['rc'] * 1000, v['rm'] * 1024, v['lc'] * 1000, v['lm'] * 1024))
