import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { PanelLeftOpen, Send, X } from 'lucide-react';
import BackofficeLayout from '../../../layouts/BackofficeLayout';
import { usePermissions } from '../../../hooks/usePermissions';
import { useCompeticionSlug } from '../../../hooks/useCompeticionSlug';
import { useNewsletterHub } from '../../../hooks/useNewsletterHub';
import { currentCompeticionAtom } from '../../../stores/auth.atoms';
import api from '../../../api/client';
import type {
  NewsletterDetail,
  NewsletterListItem,
  NewsletterProgress,
} from '../../../types/api';
import { GutenbergEditor } from './GutenbergEditor';
import { EmailPreview } from './EmailPreview';
import { NewsletterHistory } from './NewsletterHistory';
import { NewsletterSendProgressBar } from './NewsletterSendProgress';
import { ConfirmModal } from '../../../components/ui';
import './newsletter.css';

type MobileTab = 'editor' | 'preview';

const EMPTY_BODY = '';

export function Newsletter() {
  const { isRoot, isAdmin } = usePermissions();
  const canAccess = isRoot || isAdmin;

  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const competicionId = currentCompeticion?.id ?? null;
  const competicionNombre = currentCompeticion?.nombre ?? 'Newsletter';

  const { buildPath } = useCompeticionSlug();
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const routeId = params.id ? Number(params.id) : null;

  const [history, setHistory] = useState<NewsletterListItem[]>([]);
  // Starts null (not routeId) so a direct deep-link like /newsletter/4 still
  // triggers loadDocument on mount: routeId !== currentId is true the first time.
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(EMPTY_BODY);
  const [status, setStatus] = useState<NewsletterDetail['status']>('draft');
  const [progress, setProgress] = useState<NewsletterProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NewsletterListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // One-shot guard: on first page open with no id in the URL we auto-open the
  // most recent newsletter. Marked done once it fires (or when the user clicks
  // "New") so the blank new-draft view is never redirected away afterwards.
  const autoOpenDoneRef = useRef(false);

  const readOnly = status === 'sending' || status === 'sent';

  const loadHistory = useCallback(async () => {
    if (competicionId == null) return;
    const res = await api.getNewsletters(competicionId);
    if (res.success && res.data) setHistory(res.data);
  }, [competicionId]);

  const loadDocument = useCallback(
    async (id: number) => {
      if (competicionId == null) return;
      setLoadingDoc(true);
      const res = await api.getNewsletter(competicionId, id);
      setLoadingDoc(false);
      if (res.success && res.data) {
        setCurrentId(res.data.id);
        setSubject(res.data.subject);
        setBodyHtml(res.data.bodyHtml);
        setStatus(res.data.status);
        setProgress(res.data.progress);
      } else {
        toast.error(res.message || 'No se pudo cargar el newsletter');
      }
    },
    [competicionId],
  );

  // Initial + slug change: load history.
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Sync the open document with the URL id.
  useEffect(() => {
    if (routeId != null && routeId !== currentId) {
      void loadDocument(routeId);
    }
    if (routeId == null) {
      // New-draft view.
      setCurrentId(null);
      setSubject('');
      setBodyHtml(EMPTY_BODY);
      setStatus('draft');
      setProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // On first open at /newsletter (no id), redirect to the most recent entry so
  // its content loads before the editor renders. history is UpdatedAt DESC, so
  // history[0] is newest. Fires once; "New" sets the guard to keep blank drafts.
  useEffect(() => {
    if (autoOpenDoneRef.current) return;
    if (routeId != null) {
      autoOpenDoneRef.current = true;
      return;
    }
    if (history.length > 0) {
      autoOpenDoneRef.current = true;
      setLocation(buildPath(`newsletter/${history[0].id}`));
    }
  }, [history, routeId, buildPath, setLocation]);

  // Live updates over SignalR.
  const onProgress = useCallback(
    (p: NewsletterProgress) => {
      if (p.newsletterEmailId === currentId) {
        setProgress(p);
        if (p.status === 'completed') {
          setStatus(p.failedCount > 0 && p.sentCount === 0 ? 'failed' : 'sent');
        }
      }
      void loadHistory();
    },
    [currentId, loadHistory],
  );
  useNewsletterHub(competicionId, { onProgress, onHistoryChanged: loadHistory });

  const persist = useCallback(
    async (mode: 'save' | 'send'): Promise<NewsletterDetail | null> => {
      if (competicionId == null) return null;
      const payload = { subject: subject.trim() || 'Sin asunto', bodyHtml };

      // Ensure the document exists first.
      let id = currentId;
      if (id == null) {
        const created = await api.createNewsletter(competicionId, payload);
        if (!created.success || !created.data) {
          toast.error(created.message || 'No se pudo crear el borrador');
          return null;
        }
        id = created.data.id;
        setCurrentId(id);
        setLocation(buildPath(`newsletter/${id}`));
        // createNewsletter already migrated images + saved; reflect returned body.
        setBodyHtml(created.data.bodyHtml);
        if (mode === 'save') {
          setStatus(created.data.status);
          return created.data;
        }
      } else {
        const saved = await api.saveNewsletter(competicionId, id, payload);
        if (!saved.success || !saved.data) {
          toast.error(saved.message || 'No se pudo guardar');
          return null;
        }
        setBodyHtml(saved.data.bodyHtml);
        setStatus(saved.data.status);
        if (mode === 'save') return saved.data;
      }
      return api.getNewsletter(competicionId, id).then((r) => (r.success ? r.data ?? null : null));
    },
    [competicionId, currentId, subject, bodyHtml, buildPath, setLocation],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    const doc = await persist('save');
    setSaving(false);
    if (doc) {
      toast.success('Borrador guardado');
      void loadHistory();
    }
  }, [persist, loadHistory]);

  const handleSend = useCallback(async () => {
    if (competicionId == null) return;
    if (!window.confirm('Se enviará a todos los inscritos en lotes de 5 cada 10 minutos. ¿Continuar?')) return;
    setSending(true);
    // Save (and create if needed) first, then trigger send.
    const doc = await persist('save');
    if (!doc) {
      setSending(false);
      return;
    }
    const res = await api.sendNewsletter(competicionId, doc.id, {
      subject: subject.trim() || 'Sin asunto',
      bodyHtml,
    });
    setSending(false);
    if (res.success && res.data) {
      setProgress(res.data);
      setStatus('sending');
      toast.success('Envío iniciado');
      void loadHistory();
    } else {
      toast.error(res.message || 'No se pudo iniciar el envío');
    }
  }, [competicionId, persist, subject, bodyHtml, loadHistory]);

  const handleTest = useCallback(async () => {
    if (competicionId == null) return;
    const email = testEmail.trim();
    if (!email || !email.includes('@')) {
      toast.error('Introduce un email válido para la prueba');
      return;
    }
    setTesting(true);
    // Save (and create if needed) first so the test mirrors the real send.
    const doc = await persist('save');
    if (!doc) {
      setTesting(false);
      return;
    }
    const res = await api.testNewsletter(competicionId, doc.id, {
      subject: subject.trim() || 'Sin asunto',
      bodyHtml,
      email,
    });
    setTesting(false);
    if (res.success) {
      toast.success(res.message || `Email de prueba enviado a ${email}`);
      setTestModalOpen(false);
    } else {
      toast.error(res.message || 'No se pudo enviar el email de prueba');
    }
  }, [competicionId, testEmail, persist, subject, bodyHtml]);

  const handleNew = useCallback(() => {
    // User explicitly wants a blank draft: stop the one-shot auto-open from
    // redirecting back to the most recent newsletter.
    autoOpenDoneRef.current = true;
    setLocation(buildPath('newsletter'));
  }, [buildPath, setLocation]);

  const handleSelect = useCallback(
    (id: number) => {
      setLocation(buildPath(`newsletter/${id}`));
    },
    [buildPath, setLocation],
  );

  const requestDelete = useCallback(
    (id: number) => {
      const target = history.find((h) => h.id === id);
      if (target) setDeleteTarget(target);
    },
    [history],
  );

  const confirmDelete = useCallback(async () => {
    if (competicionId == null || deleteTarget == null) return;
    const id = deleteTarget.id;
    setDeleting(true);
    const res = await api.deleteNewsletter(competicionId, id);
    setDeleting(false);
    if (!res.success) {
      toast.error(res.message || 'No se pudo eliminar el newsletter');
      return;
    }
    setDeleteTarget(null);
    toast.success('Newsletter eliminado');
    // If we just deleted the open document, drop back to a blank draft.
    if (id === currentId) {
      autoOpenDoneRef.current = true;
      setLocation(buildPath('newsletter'));
    }
    void loadHistory();
  }, [competicionId, deleteTarget, currentId, buildPath, setLocation, loadHistory]);

  const editorPane = useMemo(
    () => (
      <GutenbergEditor value={bodyHtml} onChange={setBodyHtml} readOnly={readOnly} />
    ),
    [bodyHtml, readOnly],
  );

  if (!canAccess) {
    return (
      <BackofficeLayout>
        <main className="p-6" data-ui="newsletter-page">
          <section
            className="max-w-lg mx-auto mt-20 text-center bg-dark-card border border-gray-700 rounded-xl p-10"
            data-ui="newsletter-denied"
          >
            <h1 className="text-2xl font-bold text-white mb-2" data-ui="newsletter-denied-title">
              Acceso restringido
            </h1>
            <p className="text-gray-400" data-ui="newsletter-denied-text">
              Solo administradores y root pueden gestionar newsletters.
            </p>
          </section>
        </main>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <main className="newsletter-page" data-ui="newsletter-page">
        {!historyCollapsed && (
          <NewsletterHistory
            items={history}
            currentId={currentId}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={requestDelete}
            onCollapse={() => setHistoryCollapsed(true)}
          />
        )}

        <section className="newsletter-main" data-ui="newsletter-main">
          <header className="newsletter-toolbar" data-ui="newsletter-toolbar">
            {historyCollapsed && (
              <button
                type="button"
                className="newsletter-history__expand"
                data-ui="newsletter-history-expand-btn"
                aria-label="Mostrar historial"
                title="Mostrar historial"
                onClick={() => setHistoryCollapsed(false)}
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <input
              type="text"
              className="newsletter-subject"
              data-ui="newsletter-subject-input"
              placeholder="Asunto del email"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={readOnly}
            />
            <div className="newsletter-toolbar__actions" data-ui="newsletter-toolbar-actions">
              <button
                type="button"
                className="newsletter-btn newsletter-btn--ghost newsletter-btn--icon"
                data-ui="newsletter-test-open-btn"
                aria-label="Enviar prueba"
                title="Enviar prueba"
                onClick={() => setTestModalOpen(true)}
                disabled={readOnly}
              >
                <Send size={16} />
                <span>Enviar prueba</span>
              </button>
              <button
                type="button"
                className="newsletter-btn newsletter-btn--ghost"
                data-ui="newsletter-save-btn"
                onClick={handleSave}
                disabled={saving || readOnly}
              >
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                type="button"
                className="newsletter-btn newsletter-btn--primary"
                data-ui="newsletter-send-btn"
                onClick={handleSend}
                disabled={sending || readOnly}
              >
                {sending ? 'Iniciando…' : 'Enviar a inscritos'}
              </button>
            </div>
          </header>

          {progress && (
            <NewsletterSendProgressBar progress={progress} />
          )}

          <div className="newsletter-tabs" data-ui="newsletter-mobile-tabs">
            <button
              type="button"
              className={`newsletter-tab ${mobileTab === 'editor' ? 'is-active' : ''}`}
              data-ui="newsletter-tab-editor"
              onClick={() => setMobileTab('editor')}
            >
              Editor
            </button>
            <button
              type="button"
              className={`newsletter-tab ${mobileTab === 'preview' ? 'is-active' : ''}`}
              data-ui="newsletter-tab-preview"
              onClick={() => setMobileTab('preview')}
            >
              Vista previa
            </button>
          </div>

          <div className="newsletter-split" data-ui="newsletter-split">
            <div
              className={`newsletter-pane newsletter-pane--editor ${mobileTab === 'editor' ? 'is-visible' : ''}`}
              data-ui="newsletter-editor-pane"
            >
              {loadingDoc ? (
                <div className="newsletter-loading" data-ui="newsletter-loading">Cargando…</div>
              ) : (
                editorPane
              )}
            </div>
            <div
              className={`newsletter-pane newsletter-pane--preview ${mobileTab === 'preview' ? 'is-visible' : ''}`}
              data-ui="newsletter-preview-pane"
            >
              <EmailPreview headerTitle={competicionNombre} bodyHtml={bodyHtml} />
            </div>
          </div>

          {testModalOpen && (
            <div
              className="newsletter-modal__overlay"
              data-ui="newsletter-test-modal-overlay"
              onClick={() => setTestModalOpen(false)}
            >
              <div
                className="newsletter-modal"
                data-ui="newsletter-test-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Enviar email de prueba"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="newsletter-modal__header" data-ui="newsletter-test-modal-header">
                  <h2 className="newsletter-modal__title">Enviar prueba</h2>
                  <button
                    type="button"
                    className="newsletter-modal__close"
                    data-ui="newsletter-test-modal-close-btn"
                    aria-label="Cerrar"
                    title="Cerrar"
                    onClick={() => setTestModalOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="newsletter-modal__hint">
                  Se enviará una copia del borrador actual al email indicado.
                </p>
                <input
                  type="email"
                  className="newsletter-test__input"
                  data-ui="newsletter-test-email-input"
                  placeholder="email@prueba.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  disabled={testing || readOnly}
                  autoFocus
                />
                <div className="newsletter-modal__actions" data-ui="newsletter-test-modal-actions">
                  <button
                    type="button"
                    className="newsletter-btn newsletter-btn--ghost"
                    data-ui="newsletter-test-modal-cancel-btn"
                    onClick={() => setTestModalOpen(false)}
                    disabled={testing}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="newsletter-btn newsletter-btn--primary"
                    data-ui="newsletter-test-btn"
                    onClick={handleTest}
                    disabled={testing || readOnly}
                  >
                    {testing ? 'Enviando…' : 'Enviar prueba'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <ConfirmModal
          isOpen={deleteTarget != null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
          title="Eliminar newsletter"
          message={
            <>
              ¿Eliminar{' '}
              <span className="font-semibold text-white">
                «{deleteTarget?.subject?.trim() || 'Sin asunto'}»
              </span>
              ? Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          variant="danger"
          isLoading={deleting}
        />
      </main>
    </BackofficeLayout>
  );
}

export default Newsletter;
