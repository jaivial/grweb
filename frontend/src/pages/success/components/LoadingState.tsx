import type { JSX } from 'react';

export function LoadingState(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" data-ui="loading-state">
      <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" data-ui="loading-spinner" />
      <p className="text-sm text-white/50">Verificando tu compra...</p>
    </div>
  );
}

export default LoadingState;
