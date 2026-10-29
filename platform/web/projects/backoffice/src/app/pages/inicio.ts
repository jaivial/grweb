import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  GrAlert, GrBadge, GrButton, GrCard, GrEmpty, GrIcon, GrIconTile, GrKpi, GrSegmented, GrSkeleton, fmtAgo, fmtNumber, fmtShortDate,
  daysUntil, greeting, type GrIconName, type GrTone,
} from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Notifications } from '../core/notifications';
import { Realtime } from '../core/realtime';
import type { Actividad, Checklist, Competicion, Dashboard, Integracion } from '../core/api';

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

@Component({
  selector: 'bo-inicio',
  imports: [DecimalPipe, RouterLink, GrBadge, GrButton, GrCard, GrKpi, GrIcon, GrIconTile, GrAlert, GrEmpty, GrSkeleton, GrSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inicio.html',
})
export class InicioPage {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(Auth);
  protected readonly comps = inject(Competitions);
  protected readonly live = inject(Realtime);
  private readonly notifs = inject(Notifications);

  protected readonly comp = this.comps.current;
  protected readonly checklist = signal<Checklist | null>(null);
  protected readonly dash = signal<Dashboard | null>(null);
  protected readonly actividad = signal<Actividad[] | null>(null);
  protected readonly integraciones = signal<Integracion[]>([]);
  protected readonly error = signal('');
  protected readonly periodo = signal('7d');
  protected readonly periodos = [{ value: 'hoy', label: 'Hoy' }, { value: '7d', label: '7 días' }, { value: 'todo', label: 'Todo' }];

  protected readonly can = (perm: string) => this.auth.can(this.comp()?.id, perm);
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
    const k = this.dash()?.kpis ?? {};
    const v = (key: string) => (key in k ? fmtNumber(k[key]) : null);
    return [
      { label: 'Entradas reservadas', value: v('entradas.reservadas'), caption: 'esta semana' },
      { label: 'Personas', value: v('entradas.personas'), caption: 'con entrada' },
      { label: 'Boletos del sorteo', value: v('rifa.boletos'), caption: 'vendidos' },
      { label: 'Atletas confirmados', value: v('atletas.confirmados'), caption: 'importados de la AEP' },
      { label: 'Contactos', value: v('contactos.total'), caption: 'con consentimiento' },
    ];
  });
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
    for (const n of this.notifs.items().filter((n) => !n.leida && (n.nivel === 'error' || n.nivel === 'aviso')).slice(0, 3)) {
      out.push({ tone: n.nivel === 'error' ? 'danger' : 'warning', icon: n.nivel === 'error' ? 'circle-x' : 'triangle-alert', title: n.titulo, text: n.cuerpo });
    }
    return out;
  });
  protected readonly ago = fmtAgo;

  constructor() {
    effect(() => {
      const c = this.comp();
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
      firstValueFrom(this.http.get<Dashboard>(`${base}/dashboard`, { params: { modo: this.comp()?.estado === 'hoy' ? 'evento' : 'campana' } })),
      firstValueFrom(this.http.get<Actividad[]>(`${base}/actividad`, { params: { limite: 8 } })),
      this.can('integraciones.config') ? firstValueFrom(this.http.get<Integracion[]>(`${base}/integraciones`)) : Promise.resolve([] as Integracion[]),
    ]);
    const [cl, db, act, ints] = results;
    if (cl.status === 'fulfilled') this.checklist.set(cl.value);
    if (db.status === 'fulfilled') this.dash.set(db.value);
    if (act.status === 'fulfilled') this.actividad.set(act.value);
    if (ints.status === 'fulfilled') this.integraciones.set(ints.value);
    if (!quiet && results.some((r) => r.status === 'rejected')) this.error.set('Parte del Inicio no se pudo cargar.');
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
