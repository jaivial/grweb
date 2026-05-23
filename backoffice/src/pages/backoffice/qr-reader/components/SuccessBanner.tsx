import { AnimatedCheckmark } from './AnimatedCheckmark';

export function SuccessBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      data-ui="success-banner"
      className="p-5 rounded-xl bg-green-500/10 border border-green-500/20 text-center animate-success-pulse"
    >
      <div data-ui="success-banner-icon" className="flex justify-center mb-3">
        <AnimatedCheckmark size={56} color="#22c55e" />
      </div>
      <h2 data-ui="success-banner-title" className="text-xl font-bold text-green-400 mb-1">
        {title}
      </h2>
      <p data-ui="success-banner-subtitle" className="text-gray-400 text-sm">{subtitle}</p>
    </div>
  );
}
