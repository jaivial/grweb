import type { JSX } from 'react';

export function ActionButtons(): JSX.Element {
  return (
    <div className="flex justify-center" data-ui="action-buttons">
      <button
        onClick={() => { window.location.href = '/'; }}
        className="px-6 py-3 min-h-[48px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
        data-ui="btn-home"
      >
        Volver al inicio
      </button>
    </div>
  );
}

export default ActionButtons;
