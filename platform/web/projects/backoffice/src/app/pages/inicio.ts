import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  GrAlert, GrBadge, GrButton, GrCard, GrEmpty, GrIcon, GrIconTile, GrKpi, GrSegmented, GrSkeleton, fmtAgo, fmtNumber, fmtShortDate,
  daysUntil, greeting, type GrIconName, type GrTone,
} from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Realtime } from '../core/realtime';
import type { Actividad, Checklist, Competicion, Dashboard, Integracion } from '../core/api';
import { EntradasApi, type Resumen, type ResumenCheckin, type Sesion } from './entradas/api';

const ESTADO: Record<Competicion['estado'], { label: string; tone: GrTone }> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  proximamente: { label: 'Próximamente', tone: 'info' },
  inscripciones: { label: 'Campaña activa', tone: 'success' },
  completas: { label: 'Completas', tone: 'warning' },
  hoy: { label: 'Día del evento', tone: 'accent' },
  finalizado: { label: 'Finalizado', tone: 'neutral' },
  archivada: { label: 'Archivada', tone: 'neutral' },
};

/** Set-up step → section and call to action. */
const PASO: Record<string, { path: string; cta: string; perm?: string }> = {
  'datos-evento': { path: 'evento', cta: 'Continuar', perm: 'evento.editar' },
  sede: { path: 'evento', cta: 'Completar', perm: 'evento.editar' },
  modulos: { path: 'evento', cta: 'Revisar', perm: 'evento.editar' },
  'inscripcion-aep': { path: 'evento', cta: 'Añadir enlace', perm: 'evento.editar' },
  equipo: { path: 'equipo', cta: 'Invitar', perm: 'equipo.gestionar' },
  'integracion-email': { path: 'sistema', cta: 'Configurar', perm: 'integraciones.config' },
  'textos-legales': { path: 'web', cta: 'Configurar', perm: 'web.editar' },
  'entradas-sesiones': { path: 'entradas', cta: 'Configurar', perm: 'entradas.gestionar' },
  'horarios-publicados': { path: 'horarios', cta: 'Ir a horarios', perm: 'horarios.publicar' },
  'web-publicada': { path: 'web', cta: 'Publicar', perm: 'web.publicar' },
};

interface Pendiente {
  tone: GrTone;
  icon: GrIconName;
  title: string;
  text: string;
  link?: { label: string; path: string };
}

/** Milestones drawn over «Reservas por día» (Figma 96:8624). */
const HITOS: Record<string, string> = { 'web.publicada': 'Lanzamiento', 'campana.enviada': 'Campaña', 'horarios.publicados': 'Horarios' };
const COMPARA: Record<string, string> = { hoy: 'vs. ayer', '7d': 'vs. 7 días anteriores', todo: 'vs. semana pasada' };

@Component({
  selector: 'bo-inicio',
  imports: [RouterLink, GrBadge, GrButton, GrCard, GrKpi, GrIcon, GrIconTile, GrAlert, GrEmpty, GrSkeleton, GrSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inicio.html',
})
export class InicioPage {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(Auth);
  protected readonly comps = inject(Competitions);
  protected readonly live = inject(Realtime);

  protected readonly comp = this.comps.current;
  protected readonly checklist = signal<Checklist | null>(null);
  protected readonly dash = signal<Dashboard | null>(null);
  protected readonly actividad = signal<Actividad[] | null>(null);
  /** Last 100 activity entries: source of the milestones of the chart. */
  private readonly actividadLarga = signal<Actividad[]>([]);
  protected readonly integraciones = signal<Integracion[]>([]);
  /** Tickets summary (aforo por sesión, reservas por día) and, on the event day, the gate devices. */
  protected readonly resumen = signal<Resumen | null>(null);
  protected readonly checkin = signal<ResumenCheckin | null>(null);
  private readonly entradasApi = inject(EntradasApi);
  protected readonly error = signal('');
  protected readonly periodo = signal('7d');
  protected readonly periodos = [{ value: 'hoy', label: 'Hoy' }, { value: '7d', label: '7 días' }, { value: 'todo', label: 'Todo' }];
  protected readonly compara = computed(() => COMPARA[this.periodo()]);
  protected readonly fmt = fmtNumber;
  protected readonly pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

  protected readonly can = (perm: string) => this.auth.can(this.comp()?.id, perm);
  protected readonly evento = computed(() => this.comp()?.estado === 'hoy');
  protected readonly taquilla = computed(() => this.can('checkin.escanear') && !this.can('evento.editar') && !this.can('entradas.gestionar'));
  protected readonly estado = computed(() => ESTADO[this.comp()?.estado ?? 'borrador']);
  protected readonly nombre = computed(() => (this.auth.user()?.nombre ?? '').split(' ')[0]);
  protected readonly saludo = greeting();
  protected readonly dias = computed(() => daysUntil(this.comp()?.fechaInicio));
  protected readonly subtitulo = computed(() => {
    const c = this.comp();
    if (!c) return '';
    const d = this.dias();
    const cuando = d === null ? '' : d > 1 ? `Faltan ${d} días para la ${c.nombreCorto || c.nombre}` : d === 1 ? 'Mañana es el día' : d === 0 ? 'Hoy es el día' : `${c.nombreCorto || c.nombre} celebrada`;
    return [cuando, fmtShortDate(c.fechaInicio), c.sede?.nombre].filter(Boolean).join(' · ');
  });
  protected readonly primerUso = computed(() => {
    const k = this.dash()?.kpis ?? {};
    return Object.keys(k).length === 0 && !(this.checklist()?.completa ?? true);
  });
  protected readonly kpis = computed(() => {
    const d = this.dash();
    const k = d?.kpis ?? {};
    const v = (key: string) => (key in k ? fmtNumber(k[key]) : null);
    const n = (key: string) => k[key] ?? 0;
    // % vs the previous period (null when there is nothing to compare with).
    const delta = (key: string) => {
      const p = d?.previo?.[key];
      if (p === undefined || !(key in k) || p === 0) return null;
      const pct = Math.round((100 * (k[key] - p)) / p);
      return `${pct >= 0 ? '+' : ''}${fmtNumber(pct)} %`;
    };
    const trend = (key: string) => d?.serie?.[key] ?? [];
    const euros = 'sorteo.recaudado' in k ? `${fmtNumber(n('sorteo.recaudado') / 100)} € recaudados` : 'vendidos';
    const atletas = 'atletas.confirmados' in k && n('atletas.plazas') ? `${v('atletas.confirmados')} / ${fmtNumber(n('atletas.plazas'))}` : v('atletas.confirmados');
    if (this.evento()) {
      // Figma 96:9197 · día del evento
      return [
        { label: 'Personas dentro', value: 'entradas.dentro' in k ? `${fmtNumber(n('entradas.dentro'))} / ${fmtNumber(n('entradas.personas'))}` : null, caption: 'con entrada', delta: null, trend: [] as number[] },
        { label: 'Atletas confirmados', value: atletas, caption: `${n('atletas.reserva')} en reserva`, delta: null, trend: [] },
        { label: 'Entradas reservadas', value: v('entradas.reservas'), caption: 'reservas activas', delta: null, trend: [] },
        { label: 'Boletos del sorteo', value: v('sorteo.boletos'), caption: euros, delta: null, trend: [] },
      ];
    }
    const reservas = n('entradas.reservas');
    const total = n('contactos.total');
    const c = this.compara();
    return [
      { label: 'Entradas reservadas', value: v('entradas.reservas'), caption: c, delta: delta('entradas.reservas'), trend: trend('entradas.reservas') },
      { label: 'Personas', value: v('entradas.personas'), caption: reservas ? `${(n('entradas.personas') / reservas).toLocaleString('es-ES', { maximumFractionDigits: 1 })} por reserva` : 'con entrada', delta: null, trend: trend('entradas.personas') },
      { label: 'Boletos del sorteo', value: v('sorteo.boletos'), caption: euros, delta: null, trend: trend('sorteo.boletos') },
      ...('contactos.total' in k
        ? [{ label: 'Aceptan novedades', value: total ? `${Math.round((100 * n('contactos.novedades')) / total)} %` : '0 %', caption: `${fmtNumber(n('contactos.novedades'))} de ${fmtNumber(total)} · ${c}`, delta: delta('contactos.novedades'), trend: trend('contactos.novedades') }]
        : []),
      { label: 'Atletas confirmados', value: atletas, caption: `${n('atletas.bajas')} bajas · ${n('atletas.reserva')} en reserva`, delta: null, trend: trend('atletas.confirmados') },
    ];
  });
  /** Bars of «Reservas por día» (from the tickets summary: 14 days, the last one is today) with their milestones. */
  protected readonly barras = computed(() => {
    const s = this.resumen()?.serie ?? [];
    const max = Math.max(1, ...s);
    const hoy = new Date().setHours(0, 0, 0, 0);
    const hitos = new Map<number, string>();
    for (const a of this.actividadLarga()) {
      const i = s.length - 1 - Math.round((hoy - new Date(a.fecha).setHours(0, 0, 0, 0)) / 86400000);
      if (HITOS[a.tipo] && i >= 0 && i < s.length && !hitos.has(i)) hitos.set(i, HITOS[a.tipo]);
    }
    return s.map((v, i) => ({ v, h: Math.max(4, (100 * v) / max), hito: hitos.get(i) ?? '' }));
  });
  protected readonly rango = computed(() => {
    const n = this.resumen()?.serie.length ?? 0;
    return n ? `${fmtShortDate(new Date(Date.now() - (n - 1) * 86400000).toISOString())} – ${fmtShortDate(new Date().toISOString())}` : '';
  });
  /** Total places = sum of the sessions listed below (not only the published ones). */
  protected readonly plazas = computed(() => (this.resumen()?.sesiones ?? []).reduce((a, s) => a + s.aforo, 0));
  protected readonly hora = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
  protected readonly aforoTone = (s: Sesion) => (s.libres <= 0 ? 'lleno' : s.aforo && s.libres / s.aforo <= 0.1 ? 'ultimas' : 'ok');
  protected readonly pasos = computed(() =>
    (this.checklist()?.pasos ?? []).map((p) => ({ ...p, accion: PASO[p.clave], puede: !PASO[p.clave]?.perm || this.can(PASO[p.clave]!.perm!) })),
  );
  protected readonly sorteoBloqueado = computed(() => this.comp()?.modulos?.['sorteo']?.bloqueado ?? false);
  protected readonly pendientes = computed<Pendiente[]>(() => {
    const out: Pendiente[] = [];
    for (const i of this.integraciones()) {
      if (i.estado === 'error') out.push({ tone: 'danger', icon: 'circle-x', title: `La integración «${i.tipo}» falla`, text: i.error || 'Revisa la configuración y vuelve a probarla.', link: { label: 'Revisar integración', path: 'sistema' } });
    }
    if (this.sorteoBloqueado()) out.push({ tone: 'info', icon: 'scale', title: 'Sorteo de pago pendiente de visto bueno', text: 'La venta sigue desactivada hasta completar la checklist legal.', link: { label: 'Ver checklist', path: 'sorteo' } });
    // Only current state: notifications are history and live in the bell (a fixed integration must not show here).
    return out;
  });
  protected readonly ago = fmtAgo;

  constructor() {
    effect(() => {
      const c = this.comp();
      this.periodo(); // reload the KPIs when the period changes
      if (c) void this.load(c.id);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = this.live.events.subscribe((e) => {
      const c = this.comp();
      if (!c) return;
      if (e.tipo === 'kpi.delta' && e.datos) {
        this.dash.update((d) => {
          if (!d) return d;
          const kpis = { ...d.kpis };
          for (const [k, v] of Object.entries(e.datos as Record<string, number>)) kpis[k] = (kpis[k] ?? 0) + v;
          return { ...d, kpis };
        });
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => void this.load(c.id, true), 400); // debounce bursts of events
    });
    const rs = this.live.resync.subscribe(() => {
      const c = this.comp();
      if (c) void this.load(c.id);
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      rs.unsubscribe();
      clearTimeout(timer);
    });
  }

  protected async load(cid: string, quiet = false): Promise<void> {
    if (!quiet) this.error.set('');
    const base = `/api/admin/competiciones/${cid}`;
    const results = await Promise.allSettled([
      firstValueFrom(this.http.get<Checklist>(`${base}/checklist`)),
      firstValueFrom(this.http.get<Dashboard>(`${base}/dashboard`, { params: this.evento() ? { modo: 'evento', periodo: 'todo' } : { modo: 'campana', periodo: this.periodo() } })),
      firstValueFrom(this.http.get<Actividad[]>(`${base}/actividad`, { params: { limite: 100 } })),
      this.can('integraciones.config') ? firstValueFrom(this.http.get<Integracion[]>(`${base}/integraciones`)) : Promise.resolve([] as Integracion[]),
      this.can('checkin.escanear') ? this.entradasApi.resumen(cid) : Promise.resolve(null),
      this.evento() && this.can('checkin.escanear') ? this.entradasApi.resumenCheckin(cid) : Promise.resolve(null),
    ]);
    const [cl, db, act, ints, res, chk] = results;
    if (cl.status === 'fulfilled') this.checklist.set(cl.value);
    if (db.status === 'fulfilled') this.dash.set(db.value);
    if (act.status === 'fulfilled') {
      this.actividad.set(act.value.slice(0, 8));
      this.actividadLarga.set(act.value);
    }
    if (ints.status === 'fulfilled') this.integraciones.set(ints.value);
    if (res.status === 'fulfilled') this.resumen.set(res.value);
    if (chk.status === 'fulfilled') this.checkin.set(chk.value);
    if (!quiet && results.some((r) => r.status === 'rejected')) this.error.set('Parte del Inicio no se pudo cargar.');
  }

  /** «Exportar informe»: KPIs of the period and the capacity per session as CSV. */
  protected exportar(): void {
    const d = this.dash();
    const q = (x: string | number) => `"${String(x).replaceAll('"', '""')}"`;
    const rows: (string | number)[][] = [['Indicador', 'Valor', 'Periodo anterior']];
    for (const [k, v] of Object.entries(d?.kpis ?? {})) rows.push([k, v, d?.previo?.[k] ?? '']);
    rows.push([], ['Sesión', 'Ocupadas', 'Aforo']);
    for (const s of this.resumen()?.sesiones ?? []) rows.push([s.nombre, s.ocupadas, s.aforo]);
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `inicio-${this.comp()?.slug ?? 'informe'}-${this.periodo()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected iconFor(tipo: string): { icon: GrIconName; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'info' } {
    if (tipo.startsWith('identity.')) return { icon: 'users', tone: 'info' };
    if (tipo === 'evento.estado') return { icon: 'calendar', tone: 'accent' };
    if (tipo.includes('integracion')) return { icon: 'plug', tone: 'warning' };
    if (tipo.includes('checklist')) return { icon: 'circle-check', tone: 'success' };
    if (tipo.startsWith('competition.')) return { icon: 'trophy', tone: 'accent' };
    return { icon: 'activity', tone: 'neutral' };
  }
}
