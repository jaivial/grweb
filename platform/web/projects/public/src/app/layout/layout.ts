import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injectable, PLATFORM_ID, PendingTasks, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { GrButton, GrIcon, GrLogo, LOGO, LOGO_SRCSET, srcsetLogo, CdnPipe, fmtDateRange } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import type { Patrocinador } from '../core/cms';
import { COMPETITION_SLUG, Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { I18n, LocPipe, sinPrefijo } from '../core/i18n';
import { FanSession } from '../core/fan';
import { Cuenta } from '../core/cuenta';
import { Newsletter } from './newsletter';
import { AccesoModal } from '../pages/directo-social/acceso-modal';
import { Consentimiento } from '../core/consentimiento';
import { CookiesBanner } from './cookies';

export interface NavLink {
  label: string;
  href: string;
}

/** UX1-R1-3: whether the mobile bottom «Reservar» bar is on screen (the navbar then drops its own CTA on phones). */
@Injectable({ providedIn: 'root' })
export class BarraCta { readonly visible = signal(false); }

/** The mobile menu is on screen (from the tap until it has slid out): the hero idles its scroll/video loop meanwhile. */
@Injectable({ providedIn: 'root' })
export class MenuMovil { readonly enPantalla = signal(false); }

/** «Navbar / Mega menú» of Figma: the three columns of «Competición ▾» and the highlighted booking card. */
interface MegaItem { label: string; desc: string; href: string }
interface Grupo { titulo: string; items: NavLink[] }

const T = {
  es: {
    links: [
      { label: 'Competición', href: '/#campeonato' },
      { label: 'Entradas', href: '/entradas' },
      { label: 'Área Atleta', href: '/area-atleta' },
      { label: 'Horarios', href: '/horarios' },
      { label: 'En directo', href: '/en-directo' },
      { label: 'Público', href: '/publico' },
      { label: 'Cómo llegar', href: '/como-llegar' },
    ] as NavLink[],
    mega: [
      { titulo: 'Competición', items: [
        { label: 'Categorías de peso', desc: 'Pesos y divisiones de edad', href: '/categorias-de-peso' },
        { label: 'Marcas mínimas', desc: 'Totales AEP-1 por categoría', href: '/marcas-minimas' },
        { label: 'Reglamento', desc: 'Intentos, jueces y equipamiento', href: '/reglamento' },
        { label: 'Alta de atleta', desc: 'Completa tu perfil', href: '/alta-atleta' },
        { label: 'Área Atleta', desc: 'Tu horario, QR y perfil', href: '/area-atleta' },
        { label: 'Resultados', desc: 'Clasificaciones por edición', href: '/resultados' },
      ] },
      { titulo: 'El campeonato', items: [
        { label: 'Atletas', desc: 'Perfiles y su horario', href: '/atletas' },
        { label: 'Horarios', desc: 'Horarios y tarima, en directo', href: '/horarios' },
        { label: 'En directo', desc: 'Streaming y marcador', href: '/en-directo' },
        { label: 'Galería', desc: 'Fotos de la competición', href: '/galeria' },
        { label: 'Cómo será', desc: 'El montaje de la GRS Cup 2', href: '/#montaje' },
      ] },
      { titulo: 'Visita y comunidad', items: [
        { label: 'Entradas', desc: 'Gratis con reserva', href: '/entradas' },
        { label: 'Cómo llegar', desc: 'Pabellón Municipal de Almussafes', href: '/como-llegar' },
        { label: 'Público', desc: 'Normas y servicios', href: '/publico' },
        { label: 'Preguntas frecuentes', desc: 'Resolvemos tus dudas', href: '/preguntas-frecuentes' },
        { label: 'Edición 2025', desc: 'Llíria · 1–2 marzo 2025', href: '/ediciones/2025' },
        { label: 'Blog', desc: 'Noticias y crónicas', href: '/blog' },
      ] },
      { titulo: 'Juegos', items: [
        { label: 'GRS Fantasy', desc: 'Ficha atletas y suma puntos', href: '/fantasy' },
        { label: 'GRS Porra', desc: 'Acierta quién gana cada categoría', href: '/porra' },
        { label: 'Sorteo', desc: 'Rifa presencial en efectivo', href: '/sorteo' },
      ] },
    ] as { titulo: string; items: MegaItem[] }[],
    /** Groups of the mobile menu (Figma «Mobile menu v3»): the footer columns, shorter. */
    grupos: [
      { titulo: 'Competición', items: [{ label: 'Categorías de peso', href: '/categorias-de-peso' }, { label: 'Marcas mínimas', href: '/marcas-minimas' }, { label: 'Reglamento', href: '/reglamento' }, { label: 'Atletas', href: '/atletas' }, { label: 'Alta de atleta', href: '/alta-atleta' }] },
      { titulo: 'El campeonato', items: [{ label: 'Cómo será', href: '/#montaje' }, { label: 'Resultados', href: '/resultados' }, { label: 'Galería', href: '/galeria' }, { label: 'Edición 2025', href: '/ediciones/2025' }] },
      { titulo: 'Juegos', items: [{ label: 'GRS Fantasy', href: '/fantasy' }, { label: 'Porra', href: '/porra' }, { label: 'Rifa', href: '/sorteo' }] },
      { titulo: 'Visita y comunidad', items: [{ label: 'Cómo llegar', href: '/como-llegar' }, { label: 'Preguntas frecuentes', href: '/preguntas-frecuentes' }, { label: 'Blog', href: '/blog' }] },
    ] as Grupo[],
    /** The main links of the mobile menu. */
    accesos: [{ label: 'Inicio', href: '/' }, { label: 'En directo', href: '/en-directo' }, { label: 'Entradas', href: '/entradas' }, { label: 'Horarios', href: '/horarios' }, { label: 'Área Atleta', href: '/area-atleta' }, { label: 'Para el público', href: '/publico' }] as NavLink[],
    cta: 'Entrada gratis', ctaMenu: 'Reserva tu entrada gratis', open: 'Abrir menú', close: 'Cerrar menú', otherLabel: 'English version', home: 'GRS Cup 2 · inicio',
    principal: 'Principal', menu: 'Menú', megaEyebrow: 'Entrada gratuita', megaTitulo: 'Vive la GR Cup en directo', megaTexto: 'Reserva gratis tu plaza en las gradas.', reservar: 'Reservar',
    porConfirmar: 'fecha por confirmar', edicion: (y: string, f: string, ciudad: string) => `Edición ${y} · ${f} · ${ciudad}`,
    cuenta: 'Mi cuenta', perfil: 'Mi perfil', salir: 'Cerrar sesión',
  },
  en: {
    links: [
      { label: 'Competition', href: '/#campeonato' },
      { label: 'Tickets', href: '/entradas' },
      { label: 'Athlete Area', href: '/area-atleta' },
      { label: 'Schedule', href: '/horarios' },
      { label: 'Live', href: '/en-directo' },
      { label: 'Spectators', href: '/publico' },
      { label: 'Getting there', href: '/como-llegar' },
    ],
    mega: [
      { titulo: 'Competition', items: [
        { label: 'Weight classes', desc: 'Weights and age divisions', href: '/categorias-de-peso' },
        { label: 'Qualifying totals', desc: 'AEP-1 totals by class', href: '/marcas-minimas' },
        { label: 'Rules', desc: 'Attempts, referees and equipment', href: '/reglamento' },
        { label: 'Athlete sign-up', desc: 'Complete your profile', href: '/alta-atleta' },
        { label: 'Athlete Area', desc: 'Your schedule, QR and profile', href: '/area-atleta' },
        { label: 'Results', desc: 'Standings by edition', href: '/resultados' },
      ] },
      { titulo: 'The championship', items: [
        { label: 'Athletes', desc: 'Profiles and their schedule', href: '/atletas' },
        { label: 'Schedule', desc: 'Times and platform, live', href: '/horarios' },
        { label: 'Live', desc: 'Streaming and scoreboard', href: '/en-directo' },
        { label: 'Gallery', desc: 'Photos of the competition', href: '/galeria' },
        { label: 'What it will look like', desc: 'The GRS Cup 2 set-up', href: '/#montaje' },
      ] },
      { titulo: 'Visit and community', items: [
        { label: 'Tickets', desc: 'Free with booking', href: '/entradas' },
        { label: 'Getting there', desc: 'Almussafes sports hall', href: '/como-llegar' },
        { label: 'Spectators', desc: 'Rules and services', href: '/publico' },
        { label: 'FAQ', desc: 'Your questions answered', href: '/preguntas-frecuentes' },
        { label: '2025 edition', desc: 'Llíria · 1–2 March 2025', href: '/ediciones/2025' },
        { label: 'Blog', desc: 'News and reports', href: '/blog' },
      ] },
      { titulo: 'Games', items: [
        { label: 'GRS Fantasy', desc: 'Pick athletes and score points', href: '/fantasy' },
        { label: 'GRS Pool', desc: 'Guess who wins each class', href: '/porra' },
        { label: 'Raffle', desc: 'In-person cash raffle', href: '/sorteo' },
      ] },
    ],
    grupos: [
      { titulo: 'Competition', items: [{ label: 'Weight classes', href: '/categorias-de-peso' }, { label: 'Qualifying totals', href: '/marcas-minimas' }, { label: 'Rules', href: '/reglamento' }, { label: 'Athletes', href: '/atletas' }, { label: 'Athlete sign-up', href: '/alta-atleta' }] },
      { titulo: 'The championship', items: [{ label: 'What it will look like', href: '/#montaje' }, { label: 'Results', href: '/resultados' }, { label: 'Gallery', href: '/galeria' }, { label: '2025 edition', href: '/ediciones/2025' }] },
      { titulo: 'Games', items: [{ label: 'GRS Fantasy', href: '/fantasy' }, { label: 'Pool', href: '/porra' }, { label: 'Raffle', href: '/sorteo' }] },
      { titulo: 'Visit and community', items: [{ label: 'Getting there', href: '/como-llegar' }, { label: 'FAQ', href: '/preguntas-frecuentes' }, { label: 'Blog', href: '/blog' }] },
    ],
    accesos: [{ label: 'Home', href: '/' }, { label: 'Live', href: '/en-directo' }, { label: 'Tickets', href: '/entradas' }, { label: 'Schedule', href: '/horarios' }, { label: 'Athlete Area', href: '/area-atleta' }, { label: 'For spectators', href: '/publico' }],
    cta: 'Free ticket', ctaMenu: 'Book your free ticket', open: 'Open menu', close: 'Close menu', otherLabel: 'Versión en español', home: 'GRS Cup 2 · home',
    principal: 'Main', menu: 'Menu', megaEyebrow: 'Free entry', megaTitulo: 'Watch the GR Cup live', megaTexto: 'Book your free seat in the stands.', reservar: 'Book',
    porConfirmar: 'date to be confirmed', edicion: (y: string, f: string, ciudad: string) => `${y} edition · ${f} · ${ciudad}`,
    cuenta: 'My account', perfil: 'My profile', salir: 'Sign out',
  },
};

/**
 * Glass navbar aligned to the content column (Figma «Navbar», v7: column margins D 120 · T 32 · M 20).
 * On the home it appears once the hero intro is left behind (`hidden` input driven by the hero).
 */
@Component({
  selector: 'gr-navbar',
  imports: [RouterLink, LocPipe, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // UX1-R1-1: on phones the navbar stays visible during the intro (hidden only from md). UX1-R1-5: above the bottom bar and FAB while the menu is open.
  host: { class: 'fixed inset-x-0 top-0 pr-[max(20px,env(safe-area-inset-right))] pl-[max(20px,env(safe-area-inset-left))] pt-[max(12px,env(safe-area-inset-top))] max-[239px]:px-2 transition-[opacity,transform,translate] duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:pr-[max(32px,env(safe-area-inset-right))] md:pl-[max(32px,env(safe-area-inset-left))] md:pt-[max(16px,env(safe-area-inset-top))] xl:px-[120px]', '(document:click)': 'fuera($event)', '(document:keydown.escape)': 'mega.set(false); perfilMenu.set(false); open.set(false)', '[class.z-40]': '!capa()', '[class.z-60]': 'capa()', '[class.md:opacity-0]': 'hidden()', '[class.md:-translate-y-4]': 'hidden()', '[class.md:pointer-events-none]': 'hidden()', '[attr.aria-hidden]': '(hidden() && ancho()) || null', '[style.translate]': "oculta() && !open() ? '0 calc(-100% - 8px)' : null", '(window:scroll)': 'alScroll()' },
  template: `
    <nav class="@container relative mx-auto flex min-h-16 max-w-[1200px] items-center gap-2 overflow-hidden md:gap-4 min-[1440px]:gap-6 rounded-md border border-accent-deep/35 bg-bg-deep/72 px-3 max-[239px]:px-1.5 backdrop-blur-[10px] md:min-h-[72px] md:px-6" [attr.aria-label]="t().principal">
      <span class="pointer-events-none absolute -top-20 -left-10 size-40 rounded-full bg-[radial-gradient(closest-side,rgb(110_20_32/0.35),transparent)]" aria-hidden="true"></span>
      <span class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(196_43_62/0.6),transparent)]" aria-hidden="true"></span>
      <a [routerLink]="'/' | loc" class="relative shrink-0" [attr.aria-label]="t().home"><img [attr.srcset]="logoSrcset" sizes="116px" [src]="logo" alt="GRS Cup 2" class="h-[36px] w-24 object-contain max-[239px]:w-20 md:h-[40px] md:w-[116px]" /></a>
      <!-- Figma «Navbar»: tablet keeps the first three links (the rest is in «Competición ▾»); desktop adds «En directo» for quick access to the live stream, and «Cómo llegar» from xl (tighter gaps below 1440 so the labels fit on one line) -->
      <ul class="relative -mr-2 ml-auto hidden items-center md:flex lg:gap-1 min-[1440px]:gap-2">
        @for (l of links(); track l.href; let i = $index) {
          <li [class]="i > 5 ? 'hidden xl:block' : i > 2 ? 'hidden lg:block' : ''">
            @if (i === 0) {
              <!-- «Competición ▾» is marked like a link while the current page is one of its items; ↓ opens it and focuses the first item -->
              <button type="button" data-mega class="group relative inline-flex items-center rounded-xs p-2 text-label-s whitespace-nowrap pointer-coarse:min-h-11 transition-colors hover:text-text-primary" [class]="megaActivo() ? 'text-text-primary' : 'text-text-secondary'" [attr.aria-expanded]="mega()" aria-controls="mega-competicion" (click)="perfilMenu.set(false); mega.set(!mega())" (keydown.arrowdown)="abrirMega($event)">
                <span class="inline-flex items-center gap-1">{{ l.label }}<gr-icon name="chevron-down" [size]="14" class="text-text-tertiary transition-transform" [class.rotate-180]="mega()" /></span>
                <span class="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-[1px] transition-colors" [class]="megaActivo() ? 'bg-accent' : 'bg-transparent group-hover:bg-white/30'" aria-hidden="true"></span>
              </button>
            } @else {
              <!-- Figma «Nav link»: 2 px indicator under the label (white 30 % on hover, accent on the current route) -->
              <a [routerLink]="ruta(l.href) | loc" [fragment]="frag(l.href)" class="group relative inline-flex items-center rounded-xs p-2 text-label-s whitespace-nowrap pointer-coarse:min-h-11 transition-colors hover:text-text-primary" [class]="activo(l.href) ? 'text-text-primary' : 'text-text-secondary'" [attr.aria-current]="activo(l.href) ? 'page' : null">{{ l.label }}<span class="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-[1px] transition-colors" [class]="activo(l.href) ? 'bg-accent' : 'bg-transparent group-hover:bg-white/30'" aria-hidden="true"></span></a>
            }
          </li>
        }
      </ul>
      <a [routerLink]="otra()" [attr.hreflang]="otraLang()" [attr.aria-label]="t().otherLabel" class="relative hidden h-7 items-center gap-1 rounded-sm pointer-coarse:h-11 border border-white/12 px-2 text-label-xs text-text-secondary hover:text-text-primary md:inline-flex"><gr-icon name="globe" [size]="14" class="text-text-tertiary" />{{ lang() === 'en' ? 'EN' : 'ES' }}</a>
      @if (cuenta.conSesion()) {
        <button type="button" data-perfil class="relative hidden h-7 max-w-[160px] items-center gap-1.5 rounded-sm pointer-coarse:h-11 border border-white/12 px-2 text-label-xs text-text-secondary hover:text-text-primary md:inline-flex" [attr.aria-label]="t().cuenta" [attr.aria-expanded]="perfilMenu()" aria-controls="menu-perfil" (click)="mega.set(false); perfilMenu.set(!perfilMenu())"><gr-icon name="user" [size]="14" class="text-text-tertiary" /><span class="hidden truncate xl:inline">{{ cuenta.nombre() }}</span><gr-icon name="chevron-down" [size]="12" class="text-text-tertiary transition-transform" [class.rotate-180]="perfilMenu()" /></button>
      }
      @if (!activo('/entradas') && !activo('/mi-entrada')) {
      <a grButton variant="primary" [routerLink]="'/entradas' | loc" class="relative ml-auto min-h-11 max-[359px]:hidden @max-[18rem]:hidden md:ml-0" [class.max-md:hidden]="barraCta.visible()">{{ t().cta }}</a>
      } @else { <span class="ml-auto md:hidden" aria-hidden="true"></span> }
      <span class="ml-auto md:hidden min-[360px]:hidden" aria-hidden="true"></span>
      @if (barraCta.visible()) { <span class="ml-auto md:hidden min-[360px]:inline" aria-hidden="true"></span> }
      <button type="button" data-menu class="relative flex size-11 shrink-0 @max-[18rem]:ml-auto items-center justify-center rounded-sm text-text-primary hover:bg-white/6 md:hidden" [attr.aria-label]="t().open" [attr.aria-expanded]="open()" aria-controls="menu-movil" (click)="open.set(true)"><gr-icon name="menu" [size]="24" /></button>
    </nav>
    @if (perfilMenu() && cuenta.conSesion()) {
      <div class="relative mx-auto hidden max-w-[1200px] md:block">
        <div id="menu-perfil" class="absolute top-2 right-0 flex w-56 flex-col gap-1 rounded-lg border border-line-strong bg-bg-raised p-2 shadow-card">
          @if (cuenta.nombre()) { <p class="truncate px-2 pt-1 pb-2 text-label-xs text-text-muted">{{ cuenta.nombre() }}</p> }
          <a [routerLink]="cuenta.perfil() | loc" (click)="perfilMenu.set(false)" class="flex h-10 items-center gap-2 rounded-sm px-2 text-label-s text-text-secondary hover:bg-white/5 hover:text-text-primary"><gr-icon name="user" [size]="16" />{{ t().perfil }}</a>
          <button type="button" (click)="salir()" class="flex h-10 items-center gap-2 rounded-sm px-2 text-left text-label-s text-text-secondary hover:bg-white/5 hover:text-text-primary"><gr-icon name="log-out" [size]="16" />{{ t().salir }}</button>
        </div>
      </div>
    }
    @if (mega()) {
      <div id="mega-competicion" class="mx-auto mt-2 hidden max-w-[1180px] flex-wrap gap-8 rounded-xl border border-line-strong bg-bg-raised p-7 shadow-card md:flex lg:flex-nowrap" (keydown.escape)="cerrarMega()">
        @for (col of t().mega; track col.titulo) {
          <div class="flex w-[194px] flex-col gap-1 lg:w-[190px]">
            <p class="mb-1.5 text-label-xs text-text-muted">{{ col.titulo }}</p>
            @for (it of col.items; track it.href) {
              <a [routerLink]="ruta(it.href) | loc" [fragment]="frag(it.href)" (click)="mega.set(false)" class="flex flex-col gap-1 rounded-sm p-2 transition-colors hover:bg-white/5 focus-visible:bg-white/5" [class.bg-white/5]="activo(it.href)" [attr.aria-current]="activo(it.href) ? 'page' : null"><span class="text-label-s" [class.text-accent-text]="activo(it.href)">{{ it.label }}</span><span class="text-body-xs text-text-tertiary">{{ it.desc }}</span></a>
            }
          </div>
        }
        <div class="flex w-full flex-col gap-2 self-start rounded-lg border lg:ml-auto lg:w-[220px] border-accent/60 bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] p-5">
          <p class="text-label-xs text-text-secondary">{{ t().megaEyebrow }}</p>
          <p class="text-display-2xs">{{ t().megaTitulo }}</p>
          <p class="text-body-s text-text-secondary">{{ t().megaTexto }}</p>
          <!-- Figma: «Button / Display» 44 with glow -->
          <a grButton variant="display" [routerLink]="'/entradas' | loc" class="mt-2 self-start md:h-11!">{{ t().reservar }}</a>
        </div>
      </div>
    }
    @if (montado()) {
      <!-- Figma «Mobile menu v3»: logo, ES / EN and close; the four main links; the groups as an accordion (the first one
           open); the edition line and the booking button at the bottom.
           Always mounted once the page is idle (never in SSR): opening only toggles a class on this panel, so the slide is
           a compositor-only transform; scroll lock and hiding the page happen at transitionend (styles.css «gr-menu»). -->
      <div id="menu-movil" class="gr-menu fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-bg-base pt-[max(12px,env(safe-area-inset-top))] pr-[max(20px,env(safe-area-inset-right))] pl-[max(20px,env(safe-area-inset-left))] md:hidden" [class.abierto]="open()" [attr.inert]="open() ? null : ''" [attr.aria-hidden]="open() ? null : 'true'" (transitionend)="finTransicion($event)" role="dialog" aria-modal="true" (keydown.tab)="atrapar($event)" (keydown.shift.tab)="atrapar($event)" [attr.aria-label]="t().menu">
        <div class="flex shrink-0 items-center justify-between pt-2 pb-4">
          <a [routerLink]="'/' | loc" (click)="open.set(false)" [attr.aria-label]="t().home" class="flex h-11 items-center"><img [attr.srcset]="logoSrcset" sizes="92px" [src]="logo" alt="GRS Cup 2" class="h-[34px] w-[92px] object-contain" /></a>
          <div class="flex items-center gap-2">
            <a [routerLink]="otra()" [attr.hreflang]="otraLang()" [attr.aria-label]="t().otherLabel" class="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-3 text-label-s">
              <span>{{ lang() === 'en' ? 'EN' : 'ES' }}</span><span class="text-text-muted">/ {{ otraLang().toUpperCase() }}</span></a>
            <button type="button" data-cerrar-menu class="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5" [attr.aria-label]="t().close" (click)="open.set(false)"><gr-icon name="x" [size]="22" /></button>
          </div>
        </div>
        <ul class="flex flex-col">
          @for (l of accesos(); track l.href) {
            <li><a [routerLink]="ruta(l.href) | loc" [fragment]="frag(l.href)" (click)="open.set(false)" class="flex h-[54px] items-center justify-between border-b border-line-subtle px-1 text-display-xs decoration-accent decoration-2 underline-offset-8" [class.underline]="activo(l.href)" [attr.aria-current]="activo(l.href) ? 'page' : null">{{ l.label }}<gr-icon name="arrow-right" [size]="18" class="text-text-tertiary" /></a></li>
          }
          @if (cuenta.conSesion()) {
            <li><a [routerLink]="cuenta.perfil() | loc" (click)="open.set(false)" class="flex h-[54px] items-center justify-between border-b border-line-subtle px-1 text-display-xs decoration-accent decoration-2 underline-offset-8" [class.underline]="activo(cuenta.perfil())" [attr.aria-current]="activo(cuenta.perfil()) ? 'page' : null"><span class="flex items-center gap-2"><gr-icon name="user" [size]="20" class="text-text-tertiary" />{{ t().perfil }}</span><gr-icon name="arrow-right" [size]="18" class="text-text-tertiary" /></a></li>
            <li><button type="button" (click)="salir()" class="flex h-[54px] w-full items-center justify-between border-b border-line-subtle px-1 text-left text-display-xs"><span class="flex items-center gap-2"><gr-icon name="log-out" [size]="20" class="text-text-tertiary" />{{ t().salir }}</span></button></li>
          }
        </ul>
          <div class="flex flex-col pt-2">
            @for (g of t().grupos; track g.titulo; let gi = $index) {
              <div class="border-b border-line-subtle" [class.pb-3]="grupo() === gi">
                <button type="button" class="flex h-[52px] w-full items-center justify-between text-label-m" [class]="grupo() === gi ? 'text-text-primary' : 'text-text-secondary'" [attr.aria-expanded]="grupo() === gi" (click)="grupo.set(grupo() === gi ? -1 : gi)">
                  {{ g.titulo }}<gr-icon name="chevron-down" [size]="18" class="transition-transform" [class.rotate-180]="grupo() === gi" [class.text-accent-text]="grupo() === gi" />
                </button>
                @if (grupo() === gi) {
                  <ul animate.enter="gr-desplegar" class="flex flex-col gap-1">
                    @for (it of g.items; track it.href) {
                      <li><a [routerLink]="ruta(it.href) | loc" [fragment]="frag(it.href)" (click)="open.set(false)" class="flex h-11 items-center justify-between rounded-sm px-3 text-body-m text-text-secondary hover:bg-white/4 hover:text-text-primary" [class.bg-white/4]="activo(it.href)" [attr.aria-current]="activo(it.href) ? 'page' : null">{{ it.label }}<gr-icon name="arrow-right" [size]="14" class="text-text-tertiary" /></a></li>
                    }
                  </ul>
                }
              </div>
            }
          </div>
        <div class="-mx-5 mt-auto flex shrink-0 flex-col gap-3 border-t border-line-subtle px-5 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="calendar" [size]="16" class="text-accent-text" />{{ edicion() }}</p>
          <a grButton variant="primary" size="l" [routerLink]="'/entradas' | loc" [block]="true" (click)="open.set(false)">{{ t().ctaMenu }}</a>
        </div>
      </div>
    }
  `,
})
export class Navbar {
  readonly hidden = input(false);
  private readonly i18n = inject(I18n);
  protected readonly lang = this.i18n.lang;
  protected readonly t = this.i18n.dict(T);
  /** md+ viewport: only there does `hidden` apply (UX1-R1-1). */
  protected readonly ancho = signal(false);
  protected readonly open = signal(false);
  /** The menu panel exists in the DOM (browser only, after the first idle or the first tap). */
  protected readonly montado = signal(false);
  /** The navbar stays above the bottom bar while the menu is open or sliding out. */
  protected readonly capa = inject(MenuMovil).enPantalla;
  /** Open and fully slid in: only then the page behind is locked and hidden (layout + style work off the animation). */
  private readonly cubierto = signal(false);
  protected finTransicion(e: TransitionEvent): void {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    this.cubierto.set(this.open());
    if (!this.open()) this.capa.set(false);
  }
  /** UX4-R1-4: on phones in /en-directo the bar hides while scrolling down and comes back on scroll up (iOS). */
  protected readonly oculta = signal(false);
  private ultimoY = 0;
  protected alScroll(): void {
    const y = window.scrollY;
    if (window.innerWidth >= 768 || this.open() || y < 120 || !this.actual().startsWith('/en-directo')) this.oculta.set(false);
    else if (y > this.ultimoY + 4) this.oculta.set(true);
    else if (y < this.ultimoY - 4) this.oculta.set(false);
    this.ultimoY = y;
  }
  protected readonly barraCta = inject(BarraCta);
  protected readonly mega = signal(false);
  private readonly el = inject(ElementRef<HTMLElement>);
  /** The mega menu closes with a click outside the navbar (and with Esc). */
  protected fuera(e: Event): void { if ((this.mega() || this.perfilMenu()) && !this.el.nativeElement.contains(e.target as Node)) { this.mega.set(false); this.perfilMenu.set(false); } }
  /** Signed-in person: profile menu on desktop, two entries in the mobile menu. */
  protected readonly cuenta = inject(Cuenta);
  protected readonly perfilMenu = signal(false);
  protected async salir(): Promise<void> {
    this.perfilMenu.set(false);
    this.open.set(false);
    await this.cuenta.salir();
  }
  /** The current page is one of the items of «Competición ▾» (the button shows the active indicator). */
  protected readonly megaActivo = computed(() => { this.actual(); const arriba = this.t().links.map((l) => l.href); return this.t().mega.some((c) => c.items.some((i) => !i.href.includes('#') && !arriba.includes(i.href) && this.activo(i.href))); });
  /** ↓ on «Competición ▾»: open it and move the focus to its first item. */
  protected abrirMega(e: Event): void {
    e.preventDefault();
    this.mega.set(true);
    setTimeout(() => (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('#mega-competicion a')?.focus());
  }
  /** Esc inside the mega menu closes it and gives the focus back to its button. */
  protected cerrarMega(): void {
    this.mega.set(false);
    (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('button[data-mega]')?.focus();
  }
  private readonly http = inject(HttpClient);
  /** Mobile menu is a modal: Tab / Shift+Tab cycle inside it. */
  protected atrapar(e: Event): void {
    const k = e as KeyboardEvent;
    const f = [...(k.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (!f.length) return;
    const [primero, ultimo] = [f[0], f[f.length - 1]];
    if (k.shiftKey && document.activeElement === primero) { k.preventDefault(); ultimo.focus(); }
    else if (!k.shiftKey && document.activeElement === ultimo) { k.preventDefault(); primero.focus(); }
  }
  protected readonly logo = LOGO;
  protected readonly logoSrcset = LOGO_SRCSET;
  protected readonly links = computed(() => this.t().links);
  private readonly comp = inject(Competition);
  private readonly router = inject(Router);
  /** Open group of the mobile menu (Figma: «Competición» open). */
  protected readonly grupo = signal(0);
  protected readonly actual = signal('');
  /** Active on its own page and on its subpages (/atletas/:slug), by whole path segment. */
  /** SPA links (Figma 17 «Loader de página» can only show on in-app navigations): path and #fragment apart. */
  protected ruta(href: string): string { return href.split('#')[0] || '/'; }
  protected frag(href: string): string | undefined { return href.split('#')[1]; }
  protected activo(href: string): boolean { const a = this.actual(); return a === href || a.startsWith(href + '/'); }
  /** The main links of the mobile menu (only the current section is marked, underlined). */
  protected readonly accesos = computed(() => this.t().accesos);
  /** Language switch: the current page in the other language (path, query and fragment). */
  private readonly url = signal('');
  protected readonly otra = computed(() => { this.url(); this.lang(); return this.router.parseUrl(this.i18n.otra()); });
  protected readonly otraLang = computed(() => (this.lang() === 'en' ? 'es' : 'en'));
  protected readonly edicion = computed(() => {
    const c = this.comp.data();
    // «18–20 de diciembre de 2026»: the whole championship, not only its first day
    const f = c?.fechaInicio ? fmtDateRange(c.fechaInicio, c.fechaFin, this.i18n.locale()) : this.t().porConfirmar;
    return this.t().edicion((c?.fechaInicio ?? '2026').slice(0, 4), f, c?.sede?.ciudad || 'Almussafes');
  });
  constructor() {
    // current route also on the server: the SSR HTML already marks the active link (no flash, aria-current for crawlers)
    this.alNavegar();
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // the menu is a modal: no page scroll behind it, and it closes on navigation
      // focus goes into the menu when it opens (to «close») and back to the hamburger when it closes; Esc closes it
      const mq = window.matchMedia('(min-width: 768px)');
      const onMq = () => this.ancho.set(mq.matches);
      onMq();
      mq.addEventListener('change', onMq);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onMq));
      // Mount the (hidden) panel once the page is idle, so the first tap only flips a class.
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      const montar = () => this.montado.set(true);
      if (ric) ric(montar, { timeout: 3000 }); else setTimeout(montar, 1500);
      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
      let estaba = false;
      let respaldo = 0;
      effect(() => {
        const abierto = this.open();
        clearTimeout(respaldo);
        if (abierto) { this.montado.set(true); this.capa.set(true); }
        // iOS: toggling the page's scroll lock / visibility and the hero's rAF loop in the tap frame (style recalc and relayout
        // of the whole 300-460vh page, plus the hero repaint) froze the slide mid-way. Now they happen only once the opaque
        // panel covers the screen (transitionend); on close the page is restored before the panel slides out.
        if (!abierto) this.cubierto.set(false);
        else if (reducido.matches) this.cubierto.set(true);
        // fallback if transitionend never fires (tab hidden, interrupted transition)
        respaldo = window.setTimeout(() => { this.cubierto.set(this.open()); if (!this.open()) this.capa.set(false); }, 450);
        if (abierto) setTimeout(() => (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-cerrar-menu]')?.focus({ preventScroll: true }));
        else if (estaba) (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('button[data-menu]')?.focus({ preventScroll: true });
        estaba = abierto;
      });
      effect(() => {
        const cubierto = this.cubierto();
        document.body.style.overflow = cubierto ? 'hidden' : '';
        // the page behind (above all the hero's video, blend and blur layers) is not painted and the hero's loop idles
        document.documentElement.classList.toggle('gr-menu-abierto', cubierto);
      });
      this.cuenta.cargar();
      const sub = this.router.events.subscribe(() => { this.open.set(false); this.perfilMenu.set(false); this.alNavegar(); });
      inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); document.body.style.overflow = ''; document.documentElement.classList.remove('gr-menu-abierto'); });
    }
  }
  /** Active link by the Spanish path (the same tree under /en). */
  private alNavegar(): void {
    this.url.set(this.router.url);
    this.actual.set(sinPrefijo(this.router.url.split(/[?#]/)[0]));
    // R091: the menu opens with the group of the current route unfolded (e.g. /galeria → «El evento»), the rest folded;
    // set on navigation (the menu is closed then), not in the tap frame.
    this.grupo.set(this.t().grupos.findIndex((g) => g.items.some((i) => this.activo(i.href))));
  }
  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
}

/**
 * Overlays globales de la web: el modal de acceso al directo (una sola instancia: cualquier página puede pedirlo
 * con `FanSession.abrirAcceso()`). La bandeja de avisos vive solo en app.ts (UX3-R2-1).
 */
@Component({
  selector: 'gr-overlays',
  imports: [AccesoModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@defer (when fan.accesoAbierto()) { <gr-acceso-modal /> }`,
})
export class Overlays {
  protected readonly fan = inject(FanSession);

  constructor() {
    // The session of the fan is the cookie httpOnly `grcup_fan`: the browser asks once and everyone la usa.
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.fan.cargar();
  }
}

const FT = {
  es: {
    desc: 'Competición de powerlifting organizada por GRStrength en Almussafes (Valencia). Rifa presencial de material para la comunidad.',
    columnas: [
      { titulo: 'Competición', links: [{ label: 'Categorías de peso', href: '/categorias-de-peso' }, { label: 'Marcas mínimas', href: '/marcas-minimas' }, { label: 'Reglamento', href: '/reglamento' }, { label: 'Horarios', href: '/horarios' }, { label: 'Alta de atleta', href: '/alta-atleta' }] },
      { titulo: 'El campeonato', links: [{ label: 'Entradas', href: '/entradas' }, { label: 'Atletas', href: '/atletas' }, { label: 'Sorteo', href: '/sorteo' }, { label: 'En directo', href: '/en-directo' }, { label: 'Resultados', href: '/resultados' }, { label: 'Edición 2025', href: '/ediciones/2025' }, { label: 'Galería', href: '/galeria' }] },
      { titulo: 'Visita y comunidad', links: [{ label: 'Cómo llegar', href: '/como-llegar' }, { label: 'Público', href: '/publico' }, { label: 'Preguntas frecuentes', href: '/preguntas-frecuentes' }, { label: 'Patrocinadores', href: '/patrocinadores' }, { label: 'Voluntarios', href: '/voluntarios' }, { label: 'Blog', href: '/blog' }] },
      { titulo: 'Legal', links: [{ label: 'Privacidad', href: '/privacidad' }, { label: 'Términos', href: '/terminos' }, { label: 'Consentimiento de datos', href: '/consentimiento-datos' }, { label: 'Política del concurso', href: '/politica-concurso' }] },
    ] as { titulo: string; links: NavLink[] }[],
    patrocinadores: 'Patrocinadores', derechos: 'GRStrength. Todos los derechos reservados.', stripe: 'Pagos seguros con Stripe',
    configurarCookies: 'Configurar cookies',
    barraTitulo: 'Entrada gratuita', barraTexto: '1 minuto · aforo limitado', reservar: 'Reservar', arriba: 'Volver arriba',
  },
  en: {
    desc: 'Powerlifting competition organised by GRStrength in Almussafes (Valencia). In-person raffle of equipment for the community.',
    columnas: [
      { titulo: 'Competition', links: [{ label: 'Weight classes', href: '/categorias-de-peso' }, { label: 'Qualifying totals', href: '/marcas-minimas' }, { label: 'Rules', href: '/reglamento' }, { label: 'Schedule', href: '/horarios' }, { label: 'Athlete sign-up', href: '/alta-atleta' }] },
      { titulo: 'The championship', links: [{ label: 'Tickets', href: '/entradas' }, { label: 'Athletes', href: '/atletas' }, { label: 'Raffle', href: '/sorteo' }, { label: 'Live', href: '/en-directo' }, { label: 'Results', href: '/resultados' }, { label: '2025 edition', href: '/ediciones/2025' }, { label: 'Gallery', href: '/galeria' }] },
      { titulo: 'Visit and community', links: [{ label: 'Getting there', href: '/como-llegar' }, { label: 'Spectators', href: '/publico' }, { label: 'FAQ', href: '/preguntas-frecuentes' }, { label: 'Sponsors', href: '/patrocinadores' }, { label: 'Volunteers', href: '/voluntarios' }, { label: 'Blog', href: '/blog' }] },
      { titulo: 'Legal', links: [{ label: 'Privacy', href: '/privacidad' }, { label: 'Terms', href: '/terminos' }, { label: 'Data consent', href: '/consentimiento-datos' }, { label: 'Raffle terms', href: '/politica-concurso' }] },
    ],
    patrocinadores: 'Sponsors', derechos: 'GRStrength. All rights reserved.', stripe: 'Secure payments with Stripe',
    configurarCookies: 'Cookie settings',
    barraTitulo: 'Free entry', barraTexto: '1 minute · limited capacity', reservar: 'Book', arriba: 'Back to top',
  },
};

/** Footer (Figma «Footer»). */
@Component({
  selector: 'gr-footer',
  imports: [CdnPipe, RouterLink, LocPipe, GrLogo, GrIcon, Newsletter, Overlays, CookiesBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-t border-line-subtle bg-bg-deep' },
  template: `
    <!-- Figma «Footer»: mobile 48/20/32 with 28 between blocks, desktop 72/80/32 with 48 -->
    <div class="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pt-12 pb-8 md:gap-12 md:px-8 md:pt-[72px] xl:px-[120px]">
      <!-- deferred: its form pulls @angular/forms (~45 KB) out of the first load; SSR still renders it (hydrate) -->
      @defer (on viewport; hydrate on viewport) { <gr-newsletter [nivel]="nivelNewsletter()" /> } @placeholder { <div></div> }
      <div class="grid md:grid-cols-4 md:gap-x-4 lg:grid-cols-[300px_repeat(4,minmax(0,1fr))] lg:gap-x-10 xl:gap-x-14">
        <div class="mb-6 flex flex-col gap-4 md:col-span-4 md:mb-8 lg:col-span-1 lg:mb-0">
          <gr-logo [height]="56" [width]="150" />
          <p class="max-w-[300px] text-body-s text-text-tertiary md:max-w-none lg:max-w-[300px]">{{ t().desc }}</p>
          <div class="flex flex-wrap gap-2">
            <a [href]="instagram()" target="_blank" rel="noopener" aria-label="Instagram" class="flex size-11 items-center justify-center rounded-sm border border-line-subtle bg-white/5 text-text-secondary hover:text-text-primary"><gr-icon name="instagram" [size]="18" /></a>
            @if (contacto()) { <a [href]="'mailto:' + contacto()" aria-label="Email" class="flex size-11 items-center justify-center rounded-sm border border-line-subtle bg-white/5 text-text-secondary hover:text-text-primary"><gr-icon name="mail" [size]="18" /></a> }
            <a [routerLink]="otra()" [attr.hreflang]="otraLang()" class="flex h-11 shrink-0 items-center gap-2 rounded-sm border border-line-subtle px-3 text-body-s text-text-secondary hover:text-text-primary"><gr-icon name="globe" [size]="16" class="text-text-tertiary" />Español · English</a>
          </div>
          <p class="text-body-s text-text-tertiary">{{ contacto() }}{{ contacto() ? ' · ' : '' }}{{ handle() }}</p>
        </div>
        @for (col of t().columnas; track col.titulo) {
          <!-- Tablet/desktop: open column. Mobile: accordion. -->
          <nav class="hidden md:block" [attr.aria-label]="col.titulo">
            <p class="text-label-xs text-text-muted">{{ col.titulo }}</p>
            <ul class="mt-4 flex flex-col md:pointer-fine:gap-3 text-body-s text-text-secondary">@for (l of col.links; track l.href) { <li><a [routerLink]="l.href | loc" class="flex min-h-11 items-center hover:text-text-primary md:pointer-fine:min-h-0">{{ l.label }}</a></li> }</ul>
          </nav>
          <details class="group border-b border-line-subtle md:hidden">
            <summary class="flex h-15 cursor-pointer list-none items-center justify-between text-label-m">{{ col.titulo }}<gr-icon name="chevron-down" [size]="18" class="transition-transform group-open:rotate-180" /></summary>
            <ul class="flex flex-col pb-4 md:gap-3 text-body-s text-text-secondary">@for (l of col.links; track l.href) { <li><a [routerLink]="l.href | loc" class="flex min-h-11 items-center hover:text-text-primary md:min-h-0">{{ l.label }}</a></li> }</ul>
          </details>
        }
      </div>
      @if (logos().length) {
        <ul class="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 md:gap-x-10 md:gap-y-5 md:py-2" [attr.aria-label]="t().patrocinadores">
          @for (p of logosOrden(); track p.nombre) {
            <li><a [href]="p.url || ('/patrocinadores' | loc)" [attr.target]="p.url ? '_blank' : null" rel="noopener" class="flex min-h-11 items-center opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0">
              @if (p.logoUrl) { <img [attr.srcset]="srcsetLogo(p.logoUrl)" [src]="p.logoUrl | cdn" [alt]="p.nombre" class="w-auto object-contain" [class]="p.nivel === 'principal' ? 'h-12 max-w-[200px] md:h-11' : 'h-8 max-w-[150px] md:h-7'" loading="lazy" /> } @else { <span class="text-body-sm font-semibold uppercase text-text-secondary">{{ p.nombre }}</span> }</a></li>
          }
        </ul>
      }
      <div class="flex flex-col items-center gap-1 border-t border-line-subtle pt-5 text-center text-body-xs text-text-muted md:flex-row md:justify-between md:gap-3 md:text-left">
        <p>© {{ year }} GRS Cup 2 · {{ t().derechos }} · <a [routerLink]="'/cookies' | loc" class="-my-3.5 inline-flex min-h-11 items-center hover:text-text-secondary">Cookies</a> · <button type="button" (click)="consentimiento.reabrir()" class="-my-3.5 inline-flex min-h-11 items-center hover:text-text-secondary">{{ t().configurarCookies }}</button></p>
        @if (stripe()) { <p class="inline-flex h-[29px] items-center gap-1.5 rounded-pill bg-white/5 px-3 text-text-tertiary"><gr-icon name="lock" [size]="12" />{{ t().stripe }}</p> }
      </div>
    </div>
    <!-- UX5-R1-1: hueco bajo el pie para la tab bar inferior de la porra -->
    @if (tabsPorra()) { <div class="h-16 md:hidden" aria-hidden="true"></div> }
    @if (barra()) {
      <!-- Figma «Bottom CTA bar / Entrada» (mobile, also over the end of the footer: room below it) and «Back to top» -->
      <div class="h-20 md:hidden" aria-hidden="true"></div>
      <!-- UX1-R1-3: compact (~72 px) and out of the way while an inline «Reserva tu entrada» CTA is on screen -->
      <div class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line-subtle bg-bg-base/95 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-[10px] transition-[opacity,translate] duration-200 md:hidden [@media(max-height:500px)]:hidden" [class.translate-y-full]="ctaEnVista()" [class.opacity-0]="ctaEnVista()" [attr.inert]="ctaEnVista() || null">
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-s">{{ t().barraTitulo }}</span><span class="text-[13px] leading-4 text-text-tertiary">{{ t().barraTexto }}</span></span>
        <a [routerLink]="'/entradas' | loc" class="flex h-12 items-center justify-center rounded-sm bg-accent-grain px-6 text-label-m text-white">{{ t().reservar }}</a>
      </div>
      <!-- UX1-R1-4: iOS pattern - only while scrolling back up, past three screens -->
      <button type="button" (click)="arriba()" [attr.aria-label]="t().arriba" class="fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-raised shadow-card transition-opacity duration-200 md:hidden" [class.opacity-0]="!fab()" [class.pointer-events-none]="!fab()" [attr.inert]="!fab() || null"><gr-icon name="arrow-up" [size]="20" /></button>
    }
    <!-- BIZ-201: cookie banner on every page (the home renders its own, merged with the BIZ-178 notice) -->
    @if (cookies() && consentimiento.pendiente()) { <gr-cookies [sobreBarra]="barra()" /> }
    <!-- Modal de acceso al directo y avisos: una sola instancia en toda la web -->
    <gr-overlays />
  `,
})
export class Footer {
  /** Renders the site-wide cookie banner (false on the home, which merges it with its own notice). */
  readonly cookies = input(true);
  protected readonly consentimiento = inject(Consentimiento);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(FT);
  private readonly seo = inject(Seo);
  /** En /alta-atleta el contenido ya tiene sus dos H2: la banda de novedades baja a H3. En las páginas con sus dos H2 y sus tres H3 no es un encabezado. */
  protected readonly nivelNewsletter = computed<'h2' | 'h3' | 'p'>(() => {
    const p = sinPrefijo(this.seo.path());
    return p === '/donde-dormir-y-comer' || p === '/mapa-de-accesos' ? 'p' : p === '/alta-atleta' ? 'h3' : 'h2';
  });
  protected readonly year = new Date().getFullYear();
  /** /sorteo is cash-only (D-RIFA): no payment badge there. */
  protected readonly stripe = computed(() => /^\/(inscripcion|en-directo)/.test(sinPrefijo(this.seo.path())));
  private readonly comp = inject(Competition);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
  protected readonly contacto = computed(() => this.comp.data()?.evento.emailContacto ?? '');
  /** «@cuenta» of the Instagram URL (without its query, e.g. ?avpt=…, or a final slash). */
  protected readonly handle = computed(() => '@' + this.instagram().split(/[?#]/)[0].replace(/\/$/, '').split('/').pop());
  protected readonly logos = signal<Patrocinador[]>([]);
  /** BIZ-159: the main sponsors first and bigger in the footer strip. */
  protected readonly logosOrden = computed(() => [...this.logos()].sort((x, y) => Number(y.nivel === 'principal') - Number(x.nivel === 'principal')));
  protected arriba(): void { window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  private readonly scrolled = signal(false);
  protected readonly ctaEnVista = signal(false);
  protected readonly fab = signal(false);
  private readonly barraCta = inject(BarraCta);
  private readonly url = signal('');
  /** Language switch: the current page in the other language. */
  protected readonly otra = computed(() => { this.url(); return this.router.parseUrl(this.i18n.otra()); });
  protected readonly otraLang = computed(() => (this.i18n.lang() === 'en' ? 'es' : 'en'));
  /** Mobile CTA bar (Figma Mobile, every public page; UX7-R1-7: not on the event-day lookup pages): on the home only once the trophy intro is over; not on flows with their own bottom action. */
  protected readonly barra = computed(() => this.scrolled() && this.comp.data()?.modulos?.['entradas'] !== false &&
    !/^\/(inscripcion|pago|entradas|area-atleta|alta-atleta|novedades|baja|en-directo|porra|fantasy|horarios|atletas|resultados|mi-entrada|sorteo\/confirmacion|formularios)(\/|$|\?|#)/.test(sinPrefijo(this.url())));
  protected readonly srcsetLogo = srcsetLogo;
  protected readonly tabsPorra = computed(() => /^\/porra(\/|$)/.test(sinPrefijo(this.seo.path())));
  constructor() {
    // Same source on every page (cached per render and transferred to the browser): the event's data.
    void inject(PendingTasks).run(() => this.comp.load());
    // Sponsor logos are decoration: a failure must never turn the page into an error.
    void firstValueFrom(this.http.get<Patrocinador[]>(`/api/competiciones/${COMPETITION_SLUG}/patrocinadores`)).then((l) => this.logos.set(l ?? []), () => undefined);
    afterNextRender(() => this.consentimiento.cargar());
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.url.set(this.router.url);
      const sub = this.router.events.subscribe(() => { this.url.set(this.router.url); setTimeout(onScroll); });
      // always — except on the home while the trophy intro is on screen (the bar would cover it)
      const onScroll = () => {
        const hero = document.querySelector('gr-hero-trophy')?.getBoundingClientRect();
        this.scrolled.set(!hero || (window.scrollY > 480 && hero.bottom < window.innerHeight * 0.5));
        const h = window.innerHeight;
        this.ctaEnVista.set([...document.querySelectorAll('[data-cta-entrada]')].some((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < h; }));
        const y = window.scrollY;
        this.fab.set(y > h * 3 && y < ultimoY);
        ultimoY = y;
      };
      let ultimoY = window.scrollY;
      window.addEventListener('scroll', onScroll, { passive: true });
      setTimeout(onScroll);
      effect(() => this.barraCta.visible.set(this.barra()));
      inject(DestroyRef).onDestroy(() => {
        sub.unsubscribe();
        window.removeEventListener('scroll', onScroll);
      });
    }
  }
}

/** Instagram of the event («Evento» in the backoffice), with the organiser's account as fallback. */
export function instagramOf(c: CompeticionPublica | null): string {
  const v = c?.evento.instagram?.trim() ?? '';
  if (!v) return INSTAGRAM;
  return v.startsWith('https://') ? v : 'https://www.instagram.com/' + v.replace(/^@/, '').replace(/\/$/, '') + '/';
}

/** Official Instagram of the organiser (legacy site footer). */
export const INSTAGRAM = 'https://www.instagram.com/grstrengthclub?avpt=ZGwzY2JrdWhteXZo';
