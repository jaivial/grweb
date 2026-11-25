import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

/** localStorage key of the cookie choice (itself a necessary storage item, listed in /cookies). */
export const CLAVE_COOKIES = 'grcup_cookies';
/** Version of the cookie policy: bumping it asks every visitor again. */
export const VERSION_COOKIES = 1;

interface Eleccion { v: number; fecha: string; opcionales: boolean }

/**
 * Cookie consent (BIZ-201, LSSI art. 22.2): necessary cookies need no consent; the only optional category is the
 * third-party content (YouTube / Twitch broadcast). Nothing is read on the server: `cargar()` runs after the first
 * browser render, so the hydrated DOM matches the server one.
 */
@Injectable({ providedIn: 'root' })
export class Consentimiento {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** undefined: not read yet (server, first render) · null: no valid choice stored. */
  private readonly eleccion = signal<Eleccion | null | undefined>(undefined);
  /** Reopened from the footer link. */
  private readonly abierto = signal(false);
  readonly cargado = computed(() => this.eleccion() !== undefined);
  readonly decidido = computed(() => !!this.eleccion());
  readonly opcionales = computed(() => this.eleccion()?.opcionales === true);
  /** The banner must be on screen (browser only). */
  readonly pendiente = computed(() => this.eleccion() === null || this.abierto());

  cargar(): void {
    if (!this.browser || this.eleccion() !== undefined) return;
    let e: Eleccion | null = null;
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_COOKIES) ?? 'null') as Eleccion | null;
      if (v?.v === VERSION_COOKIES && typeof v.opcionales === 'boolean') e = v;
    } catch { /* storage blocked or broken value: ask again */ }
    this.eleccion.set(e);
  }

  aceptar(): void { this.guardar(true); }
  rechazar(): void { this.guardar(false); }
  reabrir(): void {
    this.cargar();
    this.abierto.set(true);
  }

  private guardar(opcionales: boolean): void {
    const e: Eleccion = { v: VERSION_COOKIES, fecha: new Date().toISOString(), opcionales };
    try { localStorage.setItem(CLAVE_COOKIES, JSON.stringify(e)); } catch { /* storage blocked: the choice lasts this visit */ }
    this.eleccion.set(e);
    this.abierto.set(false);
  }
}
