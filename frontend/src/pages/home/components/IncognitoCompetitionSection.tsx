import { FC } from 'react';

/**
 * IncognitoCompetitionSection — competición incógnito abril 2027 en Almussafes (BIZ-164).
 * La reserva (40 €) va a un Stripe Payment Link configurado en VITE_INCOGNITO_RESERVA_URL.
 * Sin URL configurada, el botón se muestra deshabilitado.
 */
const RESERVA_URL: string = import.meta.env.VITE_INCOGNITO_RESERVA_URL || '';

export const IncognitoCompetitionSection: FC = () => (
  <section
    className="w-full flex flex-col items-center py-24 px-4 bg-gradient-to-b from-dark-base via-black to-dark-base"
    data-ui="incognito-section"
  >
    <p className="text-sm md:text-base tracking-[0.4em] uppercase text-gray-400 mb-4" data-ui="incognito-kicker">
      Próximas competiciones
    </p>
    <h2
      className="text-5xl md:text-7xl font-black text-center text-white blur-[1px] select-none mb-4"
      aria-label="Nombre por revelar"
      data-ui="incognito-title"
    >
      ??? ?????
    </h2>
    <p className="text-lg md:text-xl text-red-accent font-bold uppercase tracking-widest mb-8" data-ui="incognito-meta">
      Abril 2027 · Almussafes
    </p>
    <p className="text-center text-xl md:text-2xl font-bold text-gray-100 max-w-3xl mb-10" data-ui="incognito-text">
      RESERVA TU PLAZA DE ESTA COMPETICIÓN A UN PRECIO REDUCIDO. ¡LLEVAMOS YA DOS CAMPEONATOS SOLD OUT!
    </p>
    {RESERVA_URL ? (
      <a
        href={RESERVA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center px-8 py-4 min-h-[48px] text-lg font-bold text-white bg-red-accent rounded-xl hover:bg-dark-red transition-all duration-300"
        data-ui="incognito-reserve-button"
      >
        Reservar mi plaza · 40 €
      </a>
    ) : (
      <button
        type="button"
        disabled
        className="inline-flex items-center justify-center px-8 py-4 min-h-[48px] text-lg font-bold text-white/60 bg-white/10 rounded-xl cursor-not-allowed"
        data-ui="incognito-reserve-button"
      >
        Reservar mi plaza · 40 € (próximamente)
      </button>
    )}
  </section>
);
