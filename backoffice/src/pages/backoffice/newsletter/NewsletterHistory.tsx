import { PanelLeftClose, Trash2 } from 'lucide-react';
import type { NewsletterListItem, NewsletterStatus } from '../../../types/api';

const STATUS_LABEL: Record<NewsletterStatus, string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Error',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export interface NewsletterHistoryProps {
  items: NewsletterListItem[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onCollapse: () => void;
}

export function NewsletterHistory({ items, currentId, onSelect, onNew, onDelete, onCollapse }: NewsletterHistoryProps) {
  return (
    <aside className="newsletter-history" data-ui="newsletter-history">
      <div className="newsletter-history__header" data-ui="newsletter-history-header">
        <button
          type="button"
          className="newsletter-history__collapse"
          data-ui="newsletter-history-collapse-btn"
          aria-label="Ocultar historial"
          title="Ocultar historial"
          onClick={onCollapse}
        >
          <PanelLeftClose size={18} />
        </button>
        <span className="newsletter-history__title" data-ui="newsletter-history-title">Historial</span>
        <button
          type="button"
          className="newsletter-history__new"
          data-ui="newsletter-history-new-btn"
          onClick={onNew}
        >
          + Nuevo
        </button>
      </div>
      <ul className="newsletter-history__list" data-ui="newsletter-history-list">
        {items.length === 0 && (
          <li className="newsletter-history__empty" data-ui="newsletter-history-empty">
            Aún no hay newsletters.
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="newsletter-history__row" data-ui="newsletter-history-item">
            <button
              type="button"
              className={`newsletter-history__item ${item.id === currentId ? 'is-active' : ''}`}
              data-ui="newsletter-history-item-btn"
              data-newsletter-id={item.id}
              onClick={() => onSelect(item.id)}
            >
              <span className="newsletter-history__subject" data-ui="newsletter-history-subject">
                {item.subject || 'Sin asunto'}
              </span>
              <span className="newsletter-history__meta" data-ui="newsletter-history-meta">
                <span className={`newsletter-badge newsletter-badge--${item.status}`} data-ui="newsletter-history-status">
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="newsletter-history__date" data-ui="newsletter-history-date">
                  {formatDate(item.updatedAt)}
                </span>
              </span>
              {item.progress && item.status === 'sending' && (
                <span className="newsletter-history__progress" data-ui="newsletter-history-progress">
                  {item.progress.sentCount}/{item.progress.totalRecipients}
                </span>
              )}
            </button>
            {item.status !== 'sending' && (
              <button
                type="button"
                className="newsletter-history__delete"
                data-ui="newsletter-history-delete-btn"
                data-newsletter-id={item.id}
                aria-label="Eliminar newsletter"
                title="Eliminar"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default NewsletterHistory;
