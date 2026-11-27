import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AREA_API, AreaSesion } from './area';
import { FanSession } from './fan';
import { I18n, sinPrefijo } from './i18n';

/** Pages that only make sense with a session: logging out on them goes back to the home. */
const PRIVADAS = /^\/(area-atleta|mi-perfil)(\/|$)/;

/**
 * The person signed in on the web, for the navbar: the directo account (cookie `grcup_fan`, atleta or público) and/or
 * the athlete area (cookie `gr_area`). Athletes go to /area-atleta as their profile, the público to /mi-perfil.
 */
@Injectable({ providedIn: 'root' })
export class Cuenta {
  private readonly fan = inject(FanSession);
  private readonly area = inject(AreaSesion);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly conSesion = computed(() => this.fan.yo() !== null || this.area.nombre() !== null);
  readonly atleta = computed(() => this.area.nombre() !== null || this.fan.yo()?.tipo === 'atleta');
  readonly nombre = computed(() => this.fan.yo()?.alias || this.area.nombre() || '');
  readonly perfil = computed(() => (this.atleta() ? '/area-atleta' : '/mi-perfil'));

  /** Browser only (both cookies are httpOnly): SSR renders the signed-out navbar. */
  cargar(): void {
    if (!this.browser) return;
    void this.fan.cargar();
    void this.area.comprobar();
  }

  /** Ends both sessions on the server; the UI updates from the signals, and a private page goes back home. */
  async salir(): Promise<void> {
    await Promise.all([
      this.fan.salir().catch(() => undefined),
      firstValueFrom(this.http.post(`${AREA_API}/salir`, {})).catch(() => undefined),
    ]);
    this.area.poner(null);
    if (PRIVADAS.test(sinPrefijo(this.router.url.split(/[?#]/)[0]))) await this.router.navigateByUrl(this.i18n.path('/'));
  }
}
