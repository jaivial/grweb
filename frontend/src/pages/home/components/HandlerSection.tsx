import type { JSX, FormEvent } from 'react';
import { useState } from 'react';

const EMAIL = 'contactogr8@gmail.com';
const WHATSAPP = '34644179395';

const fields = [
  { name: 'nombre', label: 'Nombre y apellidos', type: 'text' },
  { name: 'telefono', label: 'Teléfono', type: 'tel' },
  { name: 'correo', label: 'Correo', type: 'email' },
  { name: 'edad', label: 'Edad', type: 'number' },
  { name: 'categoria', label: 'Categoría', type: 'text' },
] as const;

const inputCls = 'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50';

export function HandlerSection(): JSX.Element {
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const g = (k: string) => String(d.get(k) ?? '').trim();
    const text = [
      'Solicitud de handler gratuito (GRS Coaching)',
      `Nombre: ${g('nombre')}`,
      `Teléfono: ${g('telefono')}`,
      `Correo: ${g('correo')}`,
      `Edad: ${g('edad')}`,
      `Licencia: ${g('licencia')}`,
      `Categoría: ${g('categoria')}`,
      `¿Tiene entrenador?: ${g('entrenador')}`,
      `Idea de competición: ${g('idea')}`,
    ].join('\n');
    setMessage(text);
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="handler" className="py-16 px-4 bg-dark-base" data-section="handler" data-ui="handler-section">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 text-center" style={{ fontFamily: '"Contrail One", sans-serif', textTransform: 'uppercase' }} data-ui="handler-title">
          ¿Necesitas handler?
        </h2>
        <p className="text-center text-lg text-gray-300 mb-8" data-ui="handler-subtitle">
          Podemos hacértelo, y gratis. Cortesía de GRS Coaching.
        </p>
        <form onSubmit={handleSubmit} className="grid gap-4" data-ui="handler-form">
          {fields.map(f => (
            <label key={f.name} className="grid gap-1 text-sm text-gray-200">
              {f.label}
              <input name={f.name} type={f.type} required className={inputCls} data-ui={`handler-${f.name}`} />
            </label>
          ))}
          <label className="grid gap-1 text-sm text-gray-200">
            Licencia
            <select name="licencia" required className={inputCls} defaultValue="" data-ui="handler-licencia">
              <option value="" disabled>Selecciona</option>
              <option value="AEP-2">AEP-2</option>
              <option value="AEP-3">AEP-3</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-gray-200">
            ¿Tienes entrenador?
            <select name="entrenador" required className={inputCls} defaultValue="" data-ui="handler-entrenador">
              <option value="" disabled>Selecciona</option>
              <option value="Sí">Sí</option>
              <option value="No">No</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-gray-200">
            Cuéntanos qué idea de competición tienes
            <textarea name="idea" rows={4} required className={inputCls} data-ui="handler-idea" />
          </label>
          <button type="submit" className="min-h-[48px] px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/15 transition-all" data-ui="handler-submit">
            Enviar por WhatsApp
          </button>
          {message && (
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent('Solicitud de handler gratuito')}&body=${encodeURIComponent(message)}`}
              className="text-center text-sm text-gray-300 underline"
              data-ui="handler-email"
            >
              Enviar también por correo a {EMAIL}
            </a>
          )}
        </form>
      </div>
    </section>
  );
}
