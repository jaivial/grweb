/**
 * fantasy/componentes.ts — piezas compartidas de /fantasy (Figma «72 · /fantasy» y «81 · /fantasy/salas»): la nota
 * 0–10 con su color por tramo, los avisos de estado, la barra de sala, la tendencia de la cláusula, sparkline, fila
 * de mercado, feed de movimientos, modal de clausulazo y ficha del atleta.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { GrSelector, iniciales, type OpcionSelector } from '../porra/componentes';
import {
  type AtletaAlineado, type AtletaDetalle, type AtletaMercado, type ConceptoNota, type EstadoSala, type EventoNota, type Mov, type MovimientoFeed, type Nota,
  type TramoNota, MOV_PORRA, deltaNota, nota1, nota2, pctClausula, tramoNota,
} from '../../core/juegos';
import { monedas } from '../porra/formato';

/** Color del número y del borde de una nota por tramo (tokens color/nota/*). */
export const TEXTO_NOTA: Record<TramoNota, string> = {
  gris: 'text-nota-gris', rojo: 'text-nota-rojo', ambar: 'text-nota-ambar', azul: 'text-nota-azul', verde: 'text-nota-verde', morado: 'text-nota-morado',
};
export const BORDE_NOTA: Record<TramoNota, string> = {
  gris: 'border-nota-gris', rojo: 'border-nota-rojo', ambar: 'border-nota-ambar', azul: 'border-nota-azul', verde: 'border-nota-verde', morado: 'border-nota-morado',
};
/** La clase de color del número de una nota media (2 decimales) según su tramo. */
export const colorNota = (valor: number, tieneNota = true): string => TEXTO_NOTA[tramoNota(valor, tieneNota)];

/**
 * La nota de un atleta (Figma «Nota», set 204:112349): píldora sobre bg/deep con borde de 2 px y número del color
 * del tramo. `s` es el chip pequeño que cuelga del avatar en la pista.
 */
@Component({
  selector: 'gr-nota',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'clases()', '[attr.aria-label]': '"Nota " + txt()', role: 'img' },
  template: `{{ txt() }}`,
})
export class GrNota {
  /** La nota del atleta (null o sin `tieneNota`: gris, «0,0»). */
  readonly nota = input<Nota | null>(null);
  readonly tamano = input<'m' | 's'>('m');
  protected readonly tramo = computed(() => tramoNota(this.nota()?.valor ?? 0, this.nota()?.tieneNota ?? false));
  protected readonly txt = computed(() => nota1(this.nota()?.valor ?? 0));
  protected readonly clases = computed(
    () =>
      'inline-flex shrink-0 items-center justify-center rounded-pill border-2 bg-bg-deep font-mono tabular-nums ' +
      (this.tamano() === 's' ? 'h-6 px-[7px] text-[12px] leading-none font-bold ' : 'h-[34px] px-3 text-[13px] leading-[1.4] ') +
      BORDE_NOTA[this.tramo()] + ' ' + TEXTO_NOTA[this.tramo()],
  );
}

const TONO_AVISO: Record<'neutro' | 'exito' | 'aviso' | 'error', { borde: string; icono: string; nombre: GrIconName }> = {
  neutro: { borde: 'border-line-strong', icono: 'text-text-secondary', nombre: 'bell' },
  exito: { borde: 'border-success', icono: 'text-success', nombre: 'circle-check' },
  aviso: { borde: 'border-warning', icono: 'text-warning', nombre: 'circle-alert' },
  error: { borde: 'border-crimson', icono: 'text-crimson', nombre: 'circle-alert' },
};

/**
 * Un aviso de estado (Figma «Aviso · …»): fondo casi negro (bg/deep), borde de 1 px e icono del tono; el título va
 * en texto primario y el detalle en secundario (nunca en el color del tono).
 */
@Component({
  selector: 'gr-aviso',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"flex items-start gap-3 rounded-md border bg-bg-deep px-4 py-3 " + t().borde', '[attr.role]': 'tono() === "error" || tono() === "aviso" ? "alert" : "status"' },
  template: `
    <gr-icon [name]="icono() ?? t().nombre" [size]="20" class="shrink-0" [class]="t().icono" />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <p class="text-label-s text-text-primary">{{ titulo() }}</p>
      <div class="text-body-s text-text-secondary empty:hidden"><ng-content /></div>
    </div>
    <ng-content select="[avisoAccion]" />
  `,
})
export class GrAviso {
  readonly tono = input<'neutro' | 'exito' | 'aviso' | 'error'>('neutro');
  readonly titulo = input.required<string>();
  readonly icono = input<GrIconName | null>(null);
  protected readonly t = computed(() => TONO_AVISO[this.tono()]);
}

/** El aviso de conexión en vivo perdida (el único indicador «en vivo» que queda: no hay «actualizado hace X»). */
@Component({
  selector: 'gr-aviso-conexion',
  imports: [GrAviso],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<gr-aviso tono="aviso" titulo="Sin conexión en tiempo real">Reconectando… los datos pueden estar desactualizados.</gr-aviso>`,
})
export class AvisoConexion {}

/** El distintivo de estado de una sala (Figma «Badge»): texto y tono. */
export function badgeSala(estado: EstadoSala | 'abierta', miembros = 0, plazas = 0): { txt: string; clase: string } {
  const acento = 'border-accent/45 bg-accent/12 text-accent-text';
  switch (estado) {
    case 'esperando':
      return { txt: 'Esperando (mín. 2)', clase: 'border-info/45 bg-info/12 text-info' };
    case 'llena':
      return { txt: 'Llena', clase: 'border-text-tertiary/45 bg-text-tertiary/12 text-text-tertiary' };
    case 'en_juego':
      return { txt: 'En juego', clase: acento };
    case 'cancelada':
      return { txt: 'Cancelada', clase: 'border-text-muted/45 bg-text-muted/12 text-text-muted' };
    case 'cerrada':
    case 'finalizada':
      return { txt: 'Cerrada', clase: 'border-text-muted/45 bg-text-muted/12 text-text-muted' };
    default:
      return plazas > 0 && plazas - miembros === 1 ? { txt: 'Últimas plazas', clase: acento } : { txt: 'Abierta', clase: 'border-success/45 bg-success/12 text-success' };
  }
}

/**
 * La cabecera de las páginas de fantasy con `<gr-page [juego]="true">` (Figma 72/81 a 1440): migas con puntos
 * «Inicio · Juegos · Fantasy · …», título Display/M y entradilla. Host «contents»: se apila con el gap de la página.
 */
@Component({
  selector: 'gr-fantasy-cabecera',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <nav class="text-body-xs text-text-tertiary" aria-label="Migas"><a routerLink="/" class="hover:text-text-primary">Inicio</a> · Juegos · <a routerLink="/fantasy" class="hover:text-text-primary">Fantasy</a>@for (m of migas(); track $index) { · {{ m }} }</nav>
    <div class="flex flex-col gap-2.5">
      <h1 class="text-display-s md:text-display-m">{{ titulo() }}</h1>
      @if (descripcion()) { <p class="max-w-[1064px] text-body-m text-text-secondary">{{ descripcion() }}</p> }
    </div>
  `,
})
export class FantasyCabecera {
  readonly titulo = input.required<string>();
  readonly descripcion = input('');
  readonly migas = input<string[]>([]);
}

/**
 * La barra de sala (Figma «Barra de sala»): la sala en la que se juega, sus pestañas (Resumen · Mi equipo · Mercado ·
 * Clasificación) y «Cambiar de sala». En móvil las pestañas son un selector con desplegable.
 */
@Component({
  selector: 'gr-barra-sala',
  imports: [GrIcon, GrSelector],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4' },
  template: `
    <p class="flex min-w-0 items-center gap-3">
      <gr-icon name="users" [size]="20" class="shrink-0 text-text-secondary" />
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-mono-xs text-text-muted">Sala</span>
        <span class="truncate text-label-s text-text-primary">{{ nombre() }}</span>
      </span>
      <span class="inline-flex h-7 shrink-0 items-center rounded-pill border px-3 text-label-xs" [class]="badge().clase">{{ badge().txt }}</span>
      @if (plazas()) { <span class="shrink-0 text-mono-s text-text-secondary tabular-nums">{{ miembros() }}/{{ plazas() }}</span> }
    </p>
    <gr-selector class="lg:hidden" etiqueta="Sala" [opciones]="opciones()" [valor]="activa()" />
    <nav class="hidden gap-1 rounded-pill border border-line-subtle bg-bg-surface p-1 lg:flex" aria-label="Sala">
      @for (t of opciones(); track t.v) {
        <a [href]="t.href" class="flex h-10 w-[120px] items-center justify-center rounded-pill text-label-s whitespace-nowrap transition-colors"
          [class]="t.v === activa() ? 'border border-line-strong bg-bg-raised text-text-primary' : 'border border-transparent text-text-tertiary hover:text-text-primary'"
          [attr.aria-current]="t.v === activa() ? 'page' : null">{{ t.l }}</a>
      }
    </nav>
    <a href="/fantasy/salas" class="inline-flex h-[30px] shrink-0 items-center gap-2 self-start rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary lg:self-auto">
      Cambiar de sala<gr-icon name="chevron-down" [size]="16" />
    </a>
  `,
})
export class BarraSala {
  readonly salaId = input.required<string>();
  readonly nombre = input.required<string>();
  readonly estado = input<EstadoSala | 'abierta'>('abierta');
  readonly miembros = input(0);
  readonly plazas = input(0);
  readonly activa = input<'resumen' | 'equipo' | 'mercado' | 'clasificacion'>('resumen');
  protected readonly badge = computed(() => badgeSala(this.estado(), this.miembros(), this.plazas()));
  protected readonly opciones = computed<OpcionSelector[]>(() => {
    const base = '/fantasy/salas/' + this.salaId();
    return [
      { v: 'resumen', l: 'Resumen', href: base },
      { v: 'equipo', l: 'Mi equipo', href: base + '/equipo' },
      { v: 'mercado', l: 'Mercado', href: base + '/mercado' },
      { v: 'clasificacion', l: 'Clasificación', href: base + '/clasificacion' },
    ];
  });
}

/** Sin sala no hay mercado, equipo ni clasificación propios: se invita a ir al lobby (Figma «Estado vacío»). */
@Component({
  selector: 'gr-sin-sala',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-8 text-center' },
  template: `
    <gr-icon name="users" [size]="32" class="text-text-secondary" />
    <p class="text-ui-h5 text-text-primary">Aún no estás en ninguna sala hoy</p>
    <p class="max-w-xl text-body-s text-text-secondary">El mercado, tu alineación y la clasificación van por sala. Solicita unirte a una o crea la tuya: necesitas al menos 2 jugadores para empezar.</p>
    <a grButton variant="primary" href="/fantasy/salas">Ver salas</a>
  `,
})
export class SinSala {}

/** Las posiciones de la alineación (solo visuales), en el orden de la pista. */
export const POSICION_CORTA = ['Pívot', 'Ala izq.', 'Ala der.', 'Cierre', 'Portero'];

/**
 * La alineación de un jugador como lista (Figma «Alineación» del popover, de la sala y del palmarés): avatar,
 * nombre, posición y la nota de cada atleta, y la media al pie.
 */
@Component({
  selector: 'gr-alineacion-lista',
  imports: [GrNota],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    @for (a of atletas(); track a.atletaId; let i = $index) {
      <p class="flex items-center gap-3 rounded-md bg-bg-card px-3 py-2">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-700 text-mono-xs text-text-primary">{{ ini(a.nombre) }}</span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-label-s text-text-primary">{{ a.nombre }}</span>
          <span class="text-mono-xs text-text-muted">{{ posiciones[i] ?? '' }}</span>
        </span>
        <gr-nota [nota]="a.nota" />
      </p>
    } @empty {
      <p class="rounded-md bg-bg-card px-3 py-3 text-body-xs text-text-muted">Todavía no ha fichado a nadie.</p>
    }
    @if (atletas().length) {
      <p class="flex items-center gap-2 px-3 py-2">
        <span class="min-w-0 flex-1 text-mono-xs text-text-muted">{{ pie() }}</span>
        <span class="text-ui-h5 tabular-nums" [class]="color()">{{ mediaTxt() }}</span>
      </p>
    }
  `,
})
export class AlineacionLista {
  readonly atletas = input.required<AtletaAlineado[]>();
  /** La media de la alineación (la del backend) y cuántos atletas tienen ya nota. */
  readonly media = input(0);
  readonly conNota = input(5);
  /** Jornada cerrada: la media es la final (÷ 5). */
  readonly final = input(false);
  protected readonly posiciones = POSICION_CORTA;
  protected readonly pie = computed(() => (this.final() ? 'Nota final (5 notas ÷ 5)' : `Media provisional (${this.conNota()} ${this.conNota() === 1 ? 'nota' : 'notas'} ÷ ${this.conNota()})`));
  protected readonly mediaTxt = computed(() => nota2(this.media()));
  protected readonly color = computed(() => colorNota(this.media(), this.final() || this.conNota() > 0));
  protected ini(n: string): string {
    return iniciales(n);
  }
}

/** La etiqueta de cada concepto del desglose de la nota (Figma «Desglose de la nota»). */
export function lineasNota(n: Nota | null | undefined, nulo = 0.3): { concepto: string; valor: string; clase: string }[] {
  if (!n) return [];
  const de = (c: ConceptoNota) => n.desglose.find((d) => d.concepto === c)?.valor;
  const bonus = (c: ConceptoNota, l: string) => (de(c) ? [{ concepto: l, valor: '+' + nota1(de(c)!), clase: 'text-success' }] : []);
  return [
    { concepto: `A · Intentos válidos (${n.validos} de 9)`, valor: nota1(de('intentos') ?? 0), clase: 'text-success' },
    { concepto: `Nulos (${n.nulos} × −${nota1(nulo)})`, valor: n.nulos ? '−' + nota1(Math.abs(de('nulos') ?? n.nulos * nulo)) : nota1(0), clase: n.nulos ? 'text-nota-rojo' : 'text-text-muted' },
    { concepto: 'Blanqueo (3 nulos en un movimiento)', valor: n.blanqueo ? 'nota = 0,0' : 'no ocurrió', clase: n.blanqueo ? 'text-nota-rojo' : 'text-text-muted' },
    { concepto: 'B · Puesto en su categoría', valor: nota1(de('puesto') ?? 0), clase: de('puesto') ? 'text-success' : 'text-text-muted' },
    ...bonus('pleno', 'C · Pleno 9/9'),
    ...bonus('record_personal', 'C · Récord personal'),
    ...bonus('record_competicion', 'C · Récord de la competición'),
    ...bonus('total', 'C · Total completado'),
  ];
}

/** La flecha de la cláusula (Figma «Clause trend chip»): sube, baja o se queda. */
@Component({
  selector: 'gr-clause-trend',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-6 shrink-0 items-center gap-1 rounded-pill px-2 font-mono text-[11px] font-medium tabular-nums " + clase()', '[attr.aria-label]': 'etiqueta()' },
  template: `@if (delta() > 0) { <gr-icon name="arrow-up" [size]="12" />{{ delta() }} % } @else if (delta() < 0) { <gr-icon name="arrow-down" [size]="12" />{{ -delta() }} % } @else { <span>— 0 %</span> }`,
})
export class ClauseTrend {
  /** El cambio en porcentaje (positivo o negativo). */
  readonly delta = input(0);
  protected readonly clase = computed(() =>
    this.delta() > 0 ? 'bg-success/12 text-success' : this.delta() < 0 ? 'bg-warning/12 text-warning' : 'bg-bg-raised text-text-muted',
  );
  protected readonly etiqueta = computed(() => (this.delta() > 0 ? `Cláusula sube un ${this.delta()} %` : this.delta() < 0 ? `Cláusula baja un ${-this.delta()} %` : 'Cláusula sin cambios'));
}

/** La sparkline de la cláusula (SVG propio, sin librerías). */
@Component({
  selector: 'gr-sparkline-clausula',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center', 'aria-hidden': 'true' },
  template: `
    <svg [attr.width]="w" [attr.height]="h" [attr.viewBox]="'0 0 ' + w + ' ' + h" fill="none">
      <path [attr.d]="d()" [attr.stroke]="color()" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
})
export class SparklineClausula {
  readonly valores = input<number[]>([]);
  readonly color = input('#22c55e');
  protected readonly w = 56;
  protected readonly h = 22;
  protected readonly d = computed(() => {
    const v = this.valores();
    if (v.length < 2) return `M0 ${this.h / 2} H${this.w}`;
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v
      .map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * (this.w - 4) + 2).toFixed(1)} ${(this.h - 3 - ((y - min) / span) * (this.h - 6)).toFixed(1)}`)
      .join(' ');
  });
}

/**
 * Una fila del mercado de fantasy (Figma «Fantasy market row»): atleta, tendencia, cláusula, dueño y acción. En móvil
 * va en dos líneas (arriba el atleta y la cláusula, abajo el dueño y la acción); la sparkline solo en escritorio.
 */
@Component({
  selector: 'gr-market-row',
  imports: [GrButton, GrIcon, ClauseTrend, SparklineClausula],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'clases()' },
  template: `
    <span class="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-bg-raised font-display text-[15px] text-text-primary italic" [class]="atleta().esMio ? 'border-info/70' : 'border-line-strong'">{{ ini() }}</span>
    <button type="button" class="min-w-0 flex-1 basis-[9rem] py-1 text-left" (click)="ficha.emit()" [attr.aria-label]="'Ver la ficha de ' + atleta().nombre">
      <span class="block truncate text-label-m text-text-primary hover:underline underline-offset-4">{{ atleta().nombre }}</span>
      <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
    </button>
    <span class="hidden w-[72px] shrink-0 lg:block"><gr-sparkline-clausula [valores]="serie()" [color]="color()" /></span>
    <span class="flex shrink-0 flex-col items-end gap-1 lg:w-24">
      <span class="font-mono text-[16px] font-bold text-text-primary tabular-nums">{{ monedas(atleta().clausula) }}</span>
      <gr-clause-trend [delta]="delta()" />
    </span>
    <span class="flex w-full items-center justify-between gap-3 border-t border-line-subtle pt-2.5 lg:w-auto lg:border-0 lg:pt-0">
      <span class="min-w-0 truncate font-mono text-[13px] lg:w-28" [class]="duenoColor()">
        @if (accion() === 'protegido') { <span class="inline-flex items-center gap-1 text-warning"><gr-icon name="shield" [size]="13" />{{ proteccion() }}</span> } @else { {{ dueno() }} }
      </span>
      <span class="w-32 shrink-0">
        @switch (accion()) {
          @case ('fichar') { <button grButton variant="primary" [block]="true" [disabled]="!!bloqueo()" [attr.title]="bloqueo() || null" (click)="fichar.emit()">{{ bloqueo() || 'Fichar' }}</button> }
          @case ('clausulazo') { <button type="button" class="flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-accent/60 bg-accent-deep/85 font-display text-[17px] text-white uppercase shadow-glow-deep transition-colors hover:bg-accent-deep md:h-10" (click)="clausulazo.emit()"><gr-icon name="zap" [size]="15" class="text-accent-text" />Clausulazo</button> }
          @case ('cerrado') { <span class="flex h-11 w-full items-center justify-center rounded-md bg-accent-deep/85 px-1 text-center font-display text-[13px] leading-tight text-white uppercase opacity-40 md:h-11" role="note" [attr.aria-label]="'Clausulazo cerrado desde las ' + cierre()">Cerrado desde las {{ cierre() }}</span> }
          @case ('vender') { <button grButton variant="outline" [block]="true" (click)="vender.emit()">Vender</button> }
          @default { <span class="flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-warning/30 bg-warning/8 text-label-xs text-warning md:h-10"><gr-icon name="lock" [size]="13" />Protegido</span> }
        }
      </span>
    </span>
  `,
})
export class MarketRow {
  protected readonly monedas = monedas;
  readonly atleta = input.required<AtletaMercado>();
  readonly serie = input<number[]>([]);
  readonly delta = input(0);
  readonly accion = input<'fichar' | 'clausulazo' | 'vender' | 'protegido' | 'cerrado'>('fichar');
  /** La hora desde la que los clausulazos están cerrados (última sesión del día). */
  readonly cierre = input('');
  /** Segundos que le quedan de protección (cuenta atrás «Protegido · mm:ss»). */
  readonly restante = input<number | null>(null);
  /** Por qué no se puede fichar (alineación completa o sin saldo); vacío = se puede. */
  readonly bloqueo = input('');
  readonly fichar = output<void>();
  readonly clausulazo = output<void>();
  readonly vender = output<void>();
  readonly ficha = output<void>();

  protected readonly clases = computed(
    () =>
      'flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-md border bg-bg-card px-3.5 py-3 transition-colors hover:border-line-strong lg:flex-nowrap lg:gap-4 lg:pr-3 ' +
      (this.atleta().esMio ? 'border-info/40' : 'border-line-subtle'),
  );
  /** «Protegido · 07:42» (o solo «Protegido» si el backend no envía `protegidoHasta`). */
  protected readonly proteccion = computed(() => {
    const s = this.restante();
    if (s === null || s <= 0) return 'Protegido';
    const m = Math.floor(s / 60);
    const seg = s % 60;
    return `${m}:${seg < 10 ? '0' : ''}${seg}`;
  });

  protected readonly ini = computed(() => iniciales(this.atleta().nombre));
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
  });
  protected readonly dueno = computed(() => {
    const a = this.atleta();
    if (a.esMio) return '@tú';
    if (a.duenoAlias) return '@' + a.duenoAlias;
    return 'Libre';
  });
  protected readonly duenoColor = computed(() => {
    const a = this.atleta();
    return a.esMio ? 'text-info' : a.libre ? 'text-success' : 'text-text-secondary';
  });
  protected readonly color = computed(() => (this.delta() < 0 ? '#f59e0b' : '#22c55e'));
}

/** Una fila del feed de movimientos del mercado (Figma «Feed row»). */
@Component({
  selector: 'gr-feed-row',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-start gap-3 rounded-md border border-line-subtle bg-bg-surface px-3 py-2.5' },
  template: `
    <span class="flex size-8 shrink-0 items-center justify-center rounded-sm" [class]="tono()">
      <gr-icon [name]="icono()" [size]="15" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="line-clamp-2 text-label-s text-text-primary">{{ titulo() }}</span>
      <span class="block truncate font-mono text-[11px] text-text-tertiary">{{ detalle() }}</span>
    </span>
  `,
})
export class FeedRow {
  readonly mov = input.required<MovimientoFeed>();
  /** El nombre del atleta (el evento solo trae su id). */
  readonly nombreAtleta = input('');
  protected readonly icono = computed(() => {
    const t = this.mov().tipo;
    return t === 'clausulazo' ? ('zap' as const) : t === 'compra' ? ('users' as const) : ('arrow-right' as const);
  });
  protected readonly tono = computed(() => {
    const t = this.mov().tipo;
    return t === 'clausulazo' ? 'bg-accent-deep/50 text-accent-text' : t === 'compra' ? 'bg-success/12 text-success' : 'bg-info/12 text-info';
  });
  protected readonly titulo = computed(() => {
    const m = this.mov();
    const nombre = this.nombreAtleta();
    if (m.tipo === 'compra') return `@${m.aliasA} fichó a ${nombre} (libre)`;
    if (m.tipo === 'venta') return `@${m.aliasDe} vendió a ${nombre}`;
    return `@${m.aliasA} clausuló a ${nombre} por ${monedas(m.precio)}`;
  });
  protected readonly detalle = computed(() => {
    const m = this.mov();
    const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.fecha));
    if (m.tipo === 'compra') return `Compra · ${hora} · valor ${monedas(m.precio)}`;
    if (m.tipo === 'venta') return `Venta · ${hora} · recuperó ${monedas(m.precio)}`;
    return `Clausulazo · ${hora} · el dinero fue a @${m.aliasDe}`;
  });
}

/** El modal de clausulazo (Figma «Modal Clausulazo»): quién cobra, cuánto pagas, tu saldo antes y después y la protección. */
@Component({
  selector: 'gr-clausulazo-modal',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="clausulazo-titulo">
      <button type="button" class="absolute inset-0 bg-black/75 backdrop-blur-[2px]" aria-label="Cerrar" (click)="cerrar.emit()"></button>
      <div class="relative flex max-h-[94dvh] w-full max-w-[520px] flex-col overflow-y-auto rounded-t-2xl border border-accent/50 bg-bg-raised shadow-glow-deep md:rounded-2xl">
        <span class="mx-auto mt-2 block h-1 w-11 shrink-0 rounded-pill bg-line-strong md:hidden" aria-hidden="true"></span>
        <header class="flex items-center justify-between gap-3 border-b border-accent/60 bg-accent-deep/60 px-5 py-3.5 md:py-4">
          <h2 id="clausulazo-titulo" class="flex items-center gap-2 text-display-xs"><gr-icon name="zap" [size]="20" class="text-accent-text" />Clausulazo</h2>
          <button type="button" class="-m-2 flex size-11 items-center justify-center rounded-sm text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>
        <div class="flex flex-col gap-3.5 p-5">
          @if (sala()) {
            <p class="flex items-center gap-2 text-mono-xs text-text-secondary"><gr-icon name="users" [size]="16" class="shrink-0" /><span class="min-w-0 truncate">Sala · {{ sala() }}</span></p>
          }
          <p class="flex items-center gap-3 rounded-md border border-line-strong bg-bg-card px-3 py-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent/80 bg-bg-raised font-display text-[16px] italic">{{ ini() }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-label-m">{{ atleta().nombre }}</span>
              <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
            </span>
            <span class="shrink-0 text-right">
              <span class="block font-mono text-label-s text-text-primary">{{ dueno() }}</span>
              <span class="block text-mono-xs text-text-muted">dueño actual</span>
            </span>
          </p>
          <p class="flex items-center justify-between gap-3 rounded-md border border-accent/50 bg-accent-deep/25 px-3.5 py-3">
            <span class="min-w-0">
              <span class="block text-mono-xs text-text-tertiary">Cláusula a pagar</span>
              <span class="block text-body-xs text-text-tertiary">Sube un 3 % por la demanda tras el fichaje</span>
            </span>
            <span class="shrink-0 font-mono text-[24px] font-bold text-accent-text tabular-nums md:text-[26px]">{{ monedas(atleta().clausula) }}</span>
          </p>
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
            <p class="rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
              <span class="block text-mono-xs text-text-tertiary">Tu saldo antes</span>
              <span class="block font-mono text-[18px] font-bold text-text-primary tabular-nums">{{ monedas(saldo()) }}</span>
            </p>
            <gr-icon name="arrow-right" [size]="18" class="text-text-tertiary" />
            <p class="rounded-md border px-3 py-2.5" [class]="despues() < 0 ? 'border-accent-text/50 bg-accent-deep/30' : 'border-warning/45 bg-bg-card'">
              <span class="block text-mono-xs text-text-tertiary">Después</span>
              <span class="block font-mono text-[18px] font-bold tabular-nums" [class]="despues() < 0 ? 'text-accent-text' : 'text-warning'">{{ despues() < 0 ? 'Sin saldo' : monedas(despuesMostrado()) }}</span>
            </p>
          </div>
          <ul class="flex flex-col gap-2 rounded-md border border-warning bg-bg-deep px-3.5 py-3 text-body-xs text-text-secondary">
            <li class="flex items-start gap-2"><gr-icon name="credit-card" [size]="15" class="mt-px shrink-0 text-warning" /><span>Cobra <b class="text-text-primary">{{ dueno() }}</b>: el dinero va íntegro al dueño anterior.</span></li>
            @if (proteccionMin() > 0) {
              <li class="flex items-start gap-2"><gr-icon name="shield" [size]="15" class="mt-px shrink-0 text-warning" /><span>Después queda <b class="text-text-primary">protegido {{ proteccionMin() }} min</b>: nadie te lo puede clausular.</span></li>
            }
            <li class="flex items-start gap-2"><gr-icon name="zap" [size]="15" class="mt-px shrink-0 text-warning" /><span>Clausulazos usados: <b class="font-mono text-text-primary">{{ clausulazosUsados() }} de {{ maxClausulazos() }}</b> esta jornada · sin deuda.</span></li>
          </ul>
          @if (cerrado()) {
            <p class="flex items-center gap-2 rounded-md border border-warning bg-bg-deep p-3 text-body-xs text-text-secondary" role="alert">
              <gr-icon name="circle-alert" [size]="16" class="shrink-0 text-warning" />Clausulazos cerrados desde las {{ cerrado() }}. La última sesión del día ya empezó; se reabren el próximo día de competición.
            </p>
          } @else if (error()) {
            <p class="flex items-center gap-2 rounded-md border border-crimson bg-bg-deep p-3 text-body-xs text-text-secondary" role="alert">
              <gr-icon name="circle-alert" [size]="16" class="shrink-0 text-crimson" />{{ error() }}
            </p>
          } @else if (despues() < 0) {
            <p class="flex items-center gap-2 rounded-md border border-crimson bg-bg-deep p-3 text-body-xs text-text-secondary" role="alert">
              <gr-icon name="circle-alert" [size]="16" class="shrink-0 text-crimson" />Te faltan {{ monedas(-despues()) }} monedas para pagar la cláusula.
            </p>
          } @else if (clausulazosUsados() >= maxClausulazos()) {
            <p class="flex items-center gap-2 rounded-md border border-crimson bg-bg-deep p-3 text-body-xs text-text-secondary" role="alert">
              <gr-icon name="circle-alert" [size]="16" class="shrink-0 text-crimson" />Ya has usado tus {{ maxClausulazos() }} clausulazos de esta jornada.
            </p>
          }
          <button grButton variant="display-gradient" size="m" class="h-12!" [block]="true" icon="zap" [loading]="cargando()" [disabled]="!puede()" (click)="pagar.emit()">
            {{ cerrado() ? 'Clausulazo no disponible' : 'Pagar ' + monedas(atleta().clausula) + ' y fichar' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ClausulazoModal {
  protected readonly monedas = monedas;
  readonly atleta = input.required<AtletaMercado>();
  readonly saldo = input(0);
  readonly cargando = input(false);
  readonly error = input<string | null>(null);
  readonly clausulazosUsados = input(0);
  readonly maxClausulazos = input(3);
  /** Minutos de protección tras un fichaje (de la configuración pública). */
  readonly proteccionMin = input(10);
  /** El contexto de sala («Los Cuervos de Gonzalo · 7/8»). */
  readonly sala = input('');
  /** La hora desde la que los clausulazos están cerrados (vacío = abiertos). */
  readonly cerrado = input('');

  readonly cerrar = output<void>();
  readonly pagar = output<void>();

  protected readonly ini = computed(() => iniciales(this.atleta().nombre));
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
  });
  protected readonly dueno = computed(() => {
    const a = this.atleta();
    if (!a.duenoAlias) return 'su dueño';
    return '@' + a.duenoAlias;
  });
  protected readonly despues = computed(() => this.saldo() - this.atleta().clausula);
  protected readonly despuesMostrado = computed(() => Math.max(0, this.despues()));
  protected readonly puede = computed(() => !this.cerrado() && this.despues() >= 0 && this.clausulazosUsados() < this.maxClausulazos());
}

/** La ficha del atleta (Figma «Ficha del atleta»): la curva de la cláusula y el desglose de puntos. */
@Component({
  selector: 'gr-athlete-sheet',
  imports: [GrIcon, GrNota, ClauseTrend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-label="Ficha del atleta">
      <button type="button" class="absolute inset-0 bg-black/70" aria-label="Cerrar" (click)="cerrar.emit()"></button>
      <div class="relative flex max-h-[92dvh] w-full max-w-[460px] flex-col gap-4 overflow-y-auto rounded-t-2xl border border-line-strong bg-bg-raised p-5 shadow-card md:max-h-none md:rounded-none md:border-y-0 md:border-r-0">
        <header class="flex items-start justify-between gap-3">
          <span class="flex min-w-0 items-center gap-3">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-accent/70 bg-bg-raised font-display text-[18px] italic">{{ ini() }}</span>
            <span class="min-w-0">
              <span class="block truncate text-ui-h5">{{ atleta()?.nombre ?? 'Atleta' }}</span>
              <span class="block truncate text-body-xs text-text-tertiary">{{ subtitulo() }}</span>
            </span>
          </span>
          <button type="button" class="-m-2 flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="20" /></button>
        </header>

        <p class="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
          <span class="min-w-0">
            <span class="block text-mono-xs text-text-tertiary uppercase">Cláusula actual · dueño {{ dueno() }}</span>
            <span class="block font-mono text-[24px] font-bold text-accent-text tabular-nums">{{ monedas(clausulaActual()) }}</span>
          </span>
          <gr-clause-trend [delta]="delta()" />
        </p>

        <section class="rounded-md border border-line-subtle bg-bg-card p-3">
          <p class="text-mono-xs text-text-tertiary uppercase">Evolución de la cláusula · hoy</p>
          <svg class="mt-2 h-24 w-full" [attr.viewBox]="'0 0 ' + ancho + ' 96'" preserveAspectRatio="none" fill="none" role="img" [attr.aria-label]="'Evolución de la cláusula de ' + (atleta()?.nombre ?? '')">
            <path [attr.d]="curva()" stroke="#e6606b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
            @for (p of puntosCurva(); track p.x) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" fill="#e6606b" /> }
          </svg>
          <p class="mt-2 text-body-xs text-text-tertiary">{{ resumenCurva() }}</p>
        </section>

        @if (evento(); as ev) {
          <section class="flex flex-col gap-3 rounded-lg border bg-bg-deep p-4" [class]="ev.blanqueo ? 'border-crimson' : ev.valido ? 'border-success' : 'border-warning'" aria-live="polite">
            <p class="flex items-center gap-2 text-mono-xs" [class]="ev.blanqueo ? 'text-text-primary' : 'text-text-secondary'">
              <span class="size-2 shrink-0 rounded-full" [class]="ev.blanqueo ? 'bg-crimson' : ev.valido ? 'bg-success' : 'bg-warning'" aria-hidden="true"></span>{{ ev.cabecera }}
            </p>
            <p class="text-ui-h4 text-text-primary">{{ ev.titulo }}</p>
            @if (ev.blanqueo) {
              <p class="flex items-center gap-3 text-mono-s text-text-secondary">@if (ev.antes !== null) { <span>Nota {{ n2(ev.antes) }} →</span> } <gr-nota [nota]="notaAtleta()" /></p>
              <p class="text-body-xs text-text-primary">3 nulos en un mismo movimiento: nota 0,0 absoluto. Se anula todo y la cláusula baja un 30 %.</p>
            } @else {
              <p class="text-mono-s text-text-secondary">{{ ev.linea }}</p>
            }
          </section>
        }

        <section class="flex flex-col gap-2 rounded-md bg-bg-surface p-3" aria-labelledby="ficha-desglose">
          <p class="flex items-center justify-between gap-3">
            <span id="ficha-desglose" class="text-label-xs text-text-muted">Desglose de la nota</span>
            <gr-nota [nota]="notaAtleta()" />
          </p>
          @for (l of lineas(); track l.concepto) {
            <p class="flex items-center justify-between gap-3">
              <span class="min-w-0 text-body-xs text-text-secondary" [class.line-through]="blanqueo() && l.concepto.slice(0, 8) !== 'Blanqueo'">{{ l.concepto }}</span>
              <span class="shrink-0 text-mono-s tabular-nums" [class]="l.clase">{{ l.valor }}</span>
            </p>
          }
          <p class="text-body-xs text-text-muted">{{ blanqueo() ? 'Los componentes se muestran tachados: blanqueo = nota 0,0.' : 'La nota se actualiza con cada veredicto; el puesto, al publicarse la categoría. Blanqueo = nota 0,0.' }}</p>
        </section>

        @if (fichajes().length) {
          <section class="rounded-md border border-line-subtle bg-bg-card p-3">
            <p class="text-mono-xs text-text-tertiary uppercase">Historial de fichajes</p>
            <ul class="mt-2 flex flex-col gap-2">
              @for (f of fichajes(); track f.fecha) {
                <li class="flex items-start gap-2.5">
                  <gr-icon [name]="f.tipo === 'clausulazo' ? 'zap' : f.tipo === 'compra' ? 'users' : 'arrow-right'" [size]="16" class="mt-0.5 shrink-0 text-text-tertiary" />
                  <span class="min-w-0">
                    <span class="block text-body-xs text-text-primary">{{ textoFichaje(f) }}</span>
                    <span class="block text-body-xs text-text-tertiary">{{ hora(f.fecha) }} · {{ monedas(f.precio) }}</span>
                  </span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </div>
  `,
})
export class AthleteSheet {
  protected readonly monedas = monedas;
  readonly detalle = input<AtletaDetalle | null>(null);
  readonly cargando = input(false);
  readonly fichajes = input<MovimientoFeed[]>([]);
  /** El dueño en la sala («@tú», «@alias» o «libre»): la ficha del atleta no lo trae. */
  readonly duenoTxt = input('');
  /** El último cambio de nota en vivo de este atleta (para «Nota 4,88 → 5,43 (+0,56)»). */
  readonly enVivo = input<EventoNota | null>(null);
  /** Lo que resta cada intento nulo (de la configuración pública). */
  readonly nulo = input(0.3);
  readonly cerrar = output<void>();

  protected readonly ancho = 320;
  protected readonly n2 = nota2;
  protected readonly atleta = computed(() => this.detalle()?.atleta ?? null);
  protected readonly clausulaActual = computed(() => this.atleta()?.clausula ?? 0);
  protected readonly delta = computed(() => {
    const h = this.detalle()?.clausulas ?? [];
    return h.length ? pctClausula(h[0].clausula, h[0].delta) : 0;
  });
  protected readonly dueno = computed(() => {
    const a = this.atleta();
    if (this.duenoTxt()) return this.duenoTxt();
    if (!a) return '—';
    if (a.esMio) return '@tú';
    if (a.duenoAlias) return '@' + a.duenoAlias;
    return 'libre';
  });
  protected readonly ini = computed(() => iniciales(this.atleta()?.nombre));
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    if (!a) return '';
    return `${a.sexo === 'F' ? 'Femenino' : 'Masculino'} · ${(a.categoria ?? '').replace('-', '−')} kg`;
  });
  protected readonly notaAtleta = computed<Nota | null>(() => this.atleta()?.nota ?? null);
  protected readonly blanqueo = computed(() => this.notaAtleta()?.blanqueo === true);
  protected readonly lineas = computed(() => lineasNota(this.notaAtleta(), this.nulo()));
  /** El último intento con veredicto (los movimientos van en orden: sentadilla, banca, peso muerto). */
  protected readonly evento = computed(() => {
    const it = this.detalle()?.intentos;
    const n = this.notaAtleta();
    if (!it || !n?.tieneNota) return null;
    let ultimo: { mov: Mov; n: number; peso: number; resultado: string } | null = null;
    for (const mov of ['sq', 'bp', 'dl'] as Mov[]) for (const i of it[mov] ?? []) if (i.resultado === 'valido' || i.resultado === 'nulo') ultimo = { mov, ...i };
    if (!ultimo) return null;
    const vivo = this.enVivo()?.atletaId === this.atleta()?.atletaId ? this.enVivo() : null;
    const kg = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(ultimo.peso) + ' kg';
    const valido = ultimo.resultado === 'valido';
    const donde = `${MOV_PORRA[ultimo.mov].toUpperCase()} · ${ultimo.n}.º INTENTO`;
    return {
      blanqueo: n.blanqueo,
      valido,
      cabecera: (n.blanqueo ? 'En directo · ' : 'Último evento · ') + donde,
      titulo: n.blanqueo ? `NO LIFT · BOMB-OUT (${kg})` : `${valido ? 'GOOD LIFT' : 'NO LIFT'} · ${kg}`,
      antes: vivo ? vivo.nota - vivo.delta : null,
      linea: vivo ? `Nota ${nota2(vivo.nota - vivo.delta)} → ${nota2(vivo.nota)} (${deltaNota(vivo.delta)})` : `Nota ${nota2(n.valor)}`,
    };
  });
  /** La serie de la curva: del historial más antiguo al más reciente. */
  protected readonly serie = computed(() => {
    const h = [...(this.detalle()?.clausulas ?? [])].reverse();
    return h.map((c) => c.clausula);
  });
  protected readonly puntosCurva = computed(() => {
    const v = this.serie();
    if (!v.length) return [];
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v.map((y, i) => ({
      x: v.length === 1 ? this.ancho / 2 : (i / (v.length - 1)) * this.ancho,
      y: 90 - ((y - min) / span) * 80,
    }));
  });
  protected readonly curva = computed(() =>
    this.puntosCurva()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' '),
  );
  protected readonly resumenCurva = computed(() => {
    const s = this.serie();
    if (!s.length) return 'Sin cambios de cláusula registrados.';
    const primero = s[0];
    const ultimo = s[s.length - 1];
    const pct = primero ? Math.round(((ultimo - primero) / primero) * 100) : 0;
    return `${monedas(primero)} → ${monedas(ultimo)} · ${pct >= 0 ? '+' : ''}${pct} % en la jornada · cada cambio queda en el historial`;
  });
  protected textoFichaje(f: MovimientoFeed): string {
    const nombre = this.atleta()?.nombre ?? 'el atleta';
    if (f.tipo === 'compra') return `@${f.aliasA} compró a ${nombre} (libre)`;
    if (f.tipo === 'venta') return `@${f.aliasDe} vendió a ${nombre}`;
    return `@${f.aliasA} clausuló a ${nombre} por ${monedas(f.precio)}`;
  }
  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }
}
