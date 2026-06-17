import type { NewsletterProgress } from '../../../types/api';

export interface NewsletterSendProgressBarProps {
  progress: NewsletterProgress;
}

function formatNextBatch(iso: string | null): string | null {
  if (!iso) return null;
  const next = new Date(iso).getTime();
  const diffMs = next - Date.now();
  if (diffMs <= 0) return 'en breve';
  const mins = Math.round(diffMs / 60000);
  return mins <= 1 ? 'en ~1 min' : `en ~${mins} min`;
}

export function NewsletterSendProgressBar({ progress }: NewsletterSendProgressBarProps) {
  const total = progress.totalRecipients || 1;
  const done = progress.sentCount + progress.failedCount;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const nextBatch = progress.status === 'in_progress' ? formatNextBatch(progress.nextBatchAt) : null;

  return (
    <div className="newsletter-progress" data-ui="newsletter-progress-bar">
      <div className="newsletter-progress__row" data-ui="newsletter-progress-row">
        <span className="newsletter-progress__label" data-ui="newsletter-progress-label">
          {progress.status === 'completed'
            ? 'Envío completado'
            : progress.status === 'failed'
              ? 'Envío con errores'
              : 'Enviando por lotes (5 cada 10 min)'}
        </span>
        <span className="newsletter-progress__counts" data-ui="newsletter-progress-counts">
          {progress.sentCount} enviados
          {progress.failedCount > 0 && ` · ${progress.failedCount} fallidos`} · {progress.totalRecipients} total
        </span>
      </div>
      <div className="newsletter-progress__track" data-ui="newsletter-progress-track">
        <div
          className="newsletter-progress__fill"
          data-ui="newsletter-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {nextBatch && (
        <span className="newsletter-progress__next" data-ui="newsletter-progress-next">
          Próximo lote {nextBatch}
        </span>
      )}
      {progress.lastError && (
        <span className="newsletter-progress__error" data-ui="newsletter-progress-error">
          {progress.lastError}
        </span>
      )}
    </div>
  );
}

export default NewsletterSendProgressBar;
