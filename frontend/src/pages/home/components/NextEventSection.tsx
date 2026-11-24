import type { JSX, FormEvent } from 'react';
import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';
const EVENTO = 'grscup-3';

type Status = 'idle' | 'open' | 'sending' | 'done' | 'error';

export function NextEventSection(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setStatus('sending');
    try {
      const res = await fetch(`${API_URL}/api/avisos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: EVENTO, email }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section id="grscup-3" className="py-16 px-4 bg-dark-base" data-section="next-event" data-ui="next-event-section">
      <div className="max-w-xl mx-auto rounded-2xl border border-white/20 bg-white/5 p-8 text-center" data-ui="next-event-card">
        <p className="text-sm uppercase tracking-widest text-gray-400 mb-2">Próxima competición</p>
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-3" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="next-event-title">
          GRS Cup 3
        </h2>
        <p className="text-lg text-gray-300 mb-6" data-ui="next-event-info">
          17, 18 y 19 de diciembre de 2027 · Almussafes
        </p>

        {status === 'done' ? (
          <p className="text-white font-semibold" data-ui="next-event-done">¡Listo! Te avisaremos por email.</p>
        ) : status === 'idle' ? (
          <button type="button" onClick={() => setStatus('open')} className="px-8 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200" data-ui="next-event-notify-btn">
            Avísame
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3" data-ui="next-event-form">
            <input name="email" type="email" required autoFocus placeholder="Tu email" aria-label="Email" className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50" data-ui="next-event-email" />
            <button type="submit" disabled={status === 'sending'} className="px-6 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 disabled:opacity-60" data-ui="next-event-submit">
              {status === 'sending' ? 'Enviando…' : 'Avísame'}
            </button>
          </form>
        )}
        {status === 'error' && <p className="mt-3 text-red-400 text-sm" data-ui="next-event-error">No se pudo guardar tu email. Inténtalo de nuevo.</p>}
      </div>
    </section>
  );
}
