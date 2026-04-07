import type { JSX } from 'react';

export function SuccessHeader(): JSX.Element {
  return (
    <div className="text-center mb-10" data-ui="success-header">
      <div className="relative inline-block mb-6" data-ui="success-icon-wrapper">
        <div
          className="w-24 h-24 rounded-full bg-green-500/15 flex items-center justify-center mx-auto"
          data-ui="success-icon-circle"
        >
          <svg
            className="w-12 h-12 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-ui="success-title">
        Pago completado
      </h1>

      <p className="text-base text-white/50" data-ui="success-subtitle">
        Tu participación en el sorteo ha sido confirmada
      </p>
    </div>
  );
}

export default SuccessHeader;
