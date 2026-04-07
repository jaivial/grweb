import type { JSX } from 'react';

export function NextSteps(): JSX.Element {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 mb-6" data-ui="next-steps">
      <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4" data-ui="next-steps-title">
        Siguientes pasos
      </h3>

      <div className="space-y-3" data-ui="next-steps-list">
        <div className="flex items-start gap-3" data-ui="step-email">
          <span className="text-xs font-bold text-red-accent mt-0.5">1</span>
          <p className="text-sm text-white/60">Recibirás un correo de confirmación con los detalles de tu participación.</p>
        </div>
        <div className="flex items-start gap-3" data-ui="step-draw">
          <span className="text-xs font-bold text-red-accent mt-0.5">2</span>
          <p className="text-sm text-white/60">El ganador se anunciará el último día de competición tras la entrega de premios.</p>
        </div>
        <div className="flex items-start gap-3" data-ui="step-follow">
          <span className="text-xs font-bold text-red-accent mt-0.5">3</span>
          <p className="text-sm text-white/60">Sigue <span className="text-white font-medium">@grstrengthclub</span> en Instagram para estar al día.</p>
        </div>
      </div>
    </div>
  );
}

export default NextSteps;
