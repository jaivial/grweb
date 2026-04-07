import type { JSX } from 'react';

export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" data-ui="error-state">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center" data-ui="error-icon">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-white" data-ui="error-title">Algo salió mal</h2>
      <p className="text-sm text-white/50 max-w-xs text-center" data-ui="error-message">
        {message || 'No se pudo verificar tu compra. Inténtalo de nuevo.'}
      </p>

      <div className="flex gap-3 mt-2" data-ui="error-actions">
        <button
          onClick={() => { window.location.href = '/checkout'; }}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-red-accent/90 hover:bg-red-accent rounded-xl transition-colors"
          data-ui="btn-retry"
        >
          Reintentar
        </button>
        <button
          onClick={() => { window.location.href = '/'; }}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
          data-ui="btn-home-error"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

export default ErrorState;
