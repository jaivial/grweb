import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import type { JSX } from 'react';
import { Tabs, KpiCard, Modal } from '../../../../components/ui';
import { useInscripciones } from '../hooks/useInscripciones';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { Pagination } from '../components/Pagination';
import { ResponsiveTable } from '../../../../components/ui';
import { IoMaleSharp, IoFemaleSharp } from "react-icons/io5";
import { Pencil, Trash2, Check, Download } from 'lucide-react';

// Dynamic import for pdfExport to reduce initial bundle size
const getExportPdf = () => import('../../../../utils/pdfExport').then(m => m.exportPdf);
import {
  ferInscripcionesSearchQueryAtom,
  ferInscripcionesPagoConfirmadoFilterAtom,
  ferInscripcionesExperienciaFilterAtom,
  ferInscripcionesModalidadFilterAtom,
  ferInscripcionesPaymentMethodFilterAtom,
} from '../../../../stores/ferInscripcionesStore';
import type { Inscripcion } from '../../../../types/api';
import { FerFiltersAccordion } from './FerFiltersAccordion';
import { FerInscripcionEditForm } from './FerInscripcionEditForm';
import { FerInscripcionCreateForm } from './FerInscripcionCreateForm';
import { SorteoInscritosButton } from '../inscripcionRaffle/SorteoInscritosButton';
import { SorteoInscritosModal } from '../inscripcionRaffle/SorteoInscritosModal';
import { ferRaffleStore } from '../../../../stores/inscripcionRaffleStore';

const FER_TABS = [
  { id: 'todas', label: 'Todas las inscripciones' },
  { id: 'anadir', label: 'Añadir inscripción' },
];

const FER_EXP_LABELS: Record<string, string> = {
  rookie: 'Rookie',
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

const FER_MODALIDAD_LABELS: Record<string, string> = {
  completa: 'Completa',
  solo_banca: 'Solo banca',
  solo_peso_muerto: 'Solo peso muerto',
};

const FER_PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  stripe: 'Stripe',
  transferencia: 'Transferencia',
  cupon: 'Cupón',
};

const formatMoney = (value: number): string => `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€`;

const formatPercent = (value: number): string => `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;

export function FerInscripcionesPage({ competicionId }: { competicionId: number }): JSX.Element {
  const [activeTab, setActiveTab] = useState('todas');
  const [editInscripcion, setEditInscripcion] = useState<Inscripcion | null>(null);
  const [inscripcionToDelete, setInscripcionToDelete] = useState<Inscripcion | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [exportingPdf, setExportingPdf] = useState(false);
  const previousFiltersKeyRef = useRef<string | null>(null);
  const activeListRequestKeyRef = useRef<string | null>(null);

  const {
    inscripciones,
    stats,
    isLoading,
    error,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    fetchInscripciones,
    fetchStats,
    updateInscripcion,
    createInscripcion,
    deleteInscripcion,
    goToPage,
    nextPage,
    prevPage,
    exportCsv,
  } = useInscripciones(competicionId);

  const searchQuery = useAtomValue(ferInscripcionesSearchQueryAtom);
  const pagoConfirmadoFilter = useAtomValue(ferInscripcionesPagoConfirmadoFilterAtom);
  const experienciaFilter = useAtomValue(ferInscripcionesExperienciaFilterAtom);
  const modalidadFilter = useAtomValue(ferInscripcionesModalidadFilterAtom);
  const paymentMethodFilter = useAtomValue(ferInscripcionesPaymentMethodFilterAtom);

  const listFilters = useMemo(() => ({
    search: searchQuery || undefined,
    pagoConfirmado: pagoConfirmadoFilter,
    experiencia: experienciaFilter || undefined,
    modalidad: modalidadFilter || undefined,
    paymentMethod: paymentMethodFilter || undefined,
  }), [searchQuery, pagoConfirmadoFilter, experienciaFilter, modalidadFilter, paymentMethodFilter]);

  const listFiltersKey = useMemo(() => JSON.stringify(listFilters), [listFilters]);

  const cashRevenuePercent = stats.revenue > 0 ? (stats.cashRevenue / stats.revenue) * 100 : 0;
  const stripeRevenuePercent = stats.revenue > 0 ? (stats.stripeRevenue / stats.revenue) * 100 : 0;

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab !== 'todas') return;

    const previousFiltersKey = previousFiltersKeyRef.current;
    const filtersChanged = previousFiltersKey !== null && previousFiltersKey !== listFiltersKey;
    previousFiltersKeyRef.current = listFiltersKey;

    if (filtersChanged && currentPage !== 1) {
      goToPage(1);
      return;
    }

    const targetPage = filtersChanged ? 1 : currentPage;
    const requestKey = `${competicionId}:${targetPage}:${listFiltersKey}`;

    if (activeListRequestKeyRef.current === requestKey) return;

    activeListRequestKeyRef.current = requestKey;
    void fetchInscripciones(targetPage, listFilters).finally(() => {
      if (activeListRequestKeyRef.current === requestKey) {
        activeListRequestKeyRef.current = null;
      }
    });
  }, [activeTab, competicionId, currentPage, fetchInscripciones, goToPage, listFilters, listFiltersKey]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const handleUpdateInscripcion = useCallback(async (data: any) => {
    if (!editInscripcion) return;
    setSubmissionStatus('loading');
    try {
      await updateInscripcion(editInscripcion.id, data);
      setSubmissionStatus('success');
      setEditInscripcion(null);
      setTimeout(() => setSubmissionStatus('idle'), 2000);
    } catch {
      setSubmissionStatus('idle');
    }
  }, [editInscripcion, updateInscripcion]);

  const handleCreateInscripcion = useCallback(async (data: any) => {
    setSubmissionStatus('loading');
    try {
      await createInscripcion(data);
      setSubmissionStatus('success');
      setActiveTab('todas');
      setTimeout(() => setSubmissionStatus('idle'), 2000);
    } catch {
      setSubmissionStatus('idle');
    }
  }, [createInscripcion]);

  const handleDeleteInscripcion = useCallback(async () => {
    if (!inscripcionToDelete) return;
    const result = await deleteInscripcion(inscripcionToDelete.id);
    if (result.success) {
      setInscripcionToDelete(null);
    }
  }, [inscripcionToDelete, deleteInscripcion]);

  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const columns = [
        { header: 'Nombre', dataKey: 'name' },
        { header: 'Email', dataKey: 'email' },
        { header: 'Teléfono', dataKey: 'phone' },
        { header: 'Sexo', dataKey: 'sex' },
        { header: 'Categoría', dataKey: 'category' },
        { header: 'Modalidad', dataKey: 'modality' },
        { header: 'Experiencia', dataKey: 'experience' },
        { header: 'Pago', dataKey: 'pago' },
        { header: 'Método', dataKey: 'paymentMethod' },
        { header: 'Cupón', dataKey: 'coupon' },
        { header: 'Descuento', dataKey: 'discount' },
        { header: 'Total', dataKey: 'total' },
        { header: 'Fecha', dataKey: 'date' },
      ];
      const rows = inscripciones.map(i => ({
        name: i.nombre,
        email: i.email,
        phone: i.telefono || '-',
        sex: i.sexo,
        category: i.categoriaPeso || '-',
        modality: FER_MODALIDAD_LABELS[i.modalidad] || i.modalidad || '-',
        experience: FER_EXP_LABELS[i.experiencia] || i.experiencia || '-',
        pago: i.pagoConfirmado ? 'Confirmado' : 'Pendiente',
        paymentMethod: FER_PAYMENT_METHOD_LABELS[i.paymentMethod || ''] || i.paymentMethod || '-',
        coupon: i.codigoCupon || '-',
        discount: i.importeDescuento ? `-${i.importeDescuento}€` : '-',
        total: i.totalPagado ? `${i.totalPagado}€` : '-',
        date: i.createdAt,
      }));
      const exportPdf = await getExportPdf();
      exportPdf({
        title: 'Inscripciones FER',
        columns,
        rows,
        filename: 'inscripciones-fer',
      });
    } finally {
      setExportingPdf(false);
    }
  }, [inscripciones]);

  const ferTableColumns = useMemo(() => [
    { key: 'nombre', header: 'Nombre', render: (i: Inscripcion) => (
      <button
        type="button"
        onClick={() => setEditInscripcion(i)}
        className="w-full text-left truncate hover:bg-white/5 -m-1 p-1 rounded transition-colors"
        data-ui={`fer-inscripcion-nombre-btn-${i.id}`}
        aria-label={`Editar inscripción ${i.nombre}`}
      >
        <div className="font-medium truncate text-white" data-ui={`fer-inscripcion-nombre-${i.id}`}>{i.nombre}</div>
        <div className="text-xs text-white/50 truncate" data-ui={`fer-inscripcion-email-${i.id}`}>{i.email}</div>
      </button>
    )},
    { key: 'telefono', header: 'Telf.', render: (i: Inscripcion) => i.telefono || '-' },
    { key: 'sexo', header: 'Sexo', render: (i: Inscripcion) => (
      <span className="text-xs px-2 py-1.5 rounded-xl bg-white/10 text-white/70 inline-flex items-center gap-1" data-ui="fer-sex-badge">
        {i.sexo === 'masculino' ? (
          <><IoMaleSharp className="w-4 h-4 text-blue-600" />H</>
        ) : (
          <><IoFemaleSharp className="w-4 h-4 text-pink-300" />M</>
        )}
      </span>
    )},
    { key: 'categoriaPeso', header: 'Cat.', render: (i: Inscripcion) => i.categoriaPeso || '-' },
    { key: 'modalidad', header: 'Modalidad', render: (i: Inscripcion) => (
      <span className="text-xs px-2 py-1 rounded-xl bg-sky-500/15 text-sky-300" data-ui="fer-modalidad-badge">
        {FER_MODALIDAD_LABELS[i.modalidad] || i.modalidad || '-'}
      </span>
    )},
    { key: 'experiencia', header: 'Exp.', render: (i: Inscripcion) => (
      <span className="text-xs px-2 py-1 rounded-xl bg-white/10 text-white/70" data-ui="fer-exp-badge">
        {FER_EXP_LABELS[i.experiencia] || i.experiencia || '-'}
      </span>
    )},
    { key: 'quiereHandler', header: 'Handler', render: (i: Inscripcion) => (
      <span className={`text-xs px-2 py-1 rounded-xl inline-flex items-center gap-1 ${i.quiereHandler ? 'bg-purple-500/15 text-purple-400' : 'bg-white/5 text-white/40'}`} data-ui="fer-handler-badge">
        {i.quiereHandler ? '✓' : '—'}
      </span>
    )},
    { key: 'peakProgram', header: 'Peak Prg', render: (i: Inscripcion) => (
      <span className={`text-xs px-2 py-1 rounded-xl inline-flex items-center gap-1 ${i.quierePeakProgram ? 'bg-indigo-500/15 text-indigo-400' : 'bg-white/5 text-white/40'}`} data-ui="fer-peakprogram-badge">
        {i.quierePeakProgram ? '✓' : '—'}
      </span>
    )},

    { key: 'pagoConfirmado', header: 'Pago', render: (i: Inscripcion) => (
      <span className={`text-xs px-2 py-1 rounded-xl ${i.pagoConfirmado ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`} data-ui="fer-pago-badge">
        {i.pagoConfirmado ? 'Confirmado' : 'Pendiente'}
      </span>
    )},
    { key: 'paymentMethod', header: 'Método', render: (i: Inscripcion) => (
      <span className={`text-xs px-2 py-1 rounded-xl ${i.paymentMethod === 'stripe' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-amber-500/15 text-amber-300'}`} data-ui="fer-payment-method-badge">
        {FER_PAYMENT_METHOD_LABELS[i.paymentMethod || ''] || i.paymentMethod || '—'}
      </span>
    )},
    { key: 'codigoCupon', header: 'Cupón', render: (i: Inscripcion) => i.codigoCupon ? (
      <span className="text-xs px-2 py-1 rounded-xl bg-green-500/15 text-green-300" data-ui="fer-coupon-badge">
        {i.codigoCupon} · -{i.importeDescuento || 0}€
      </span>
    ) : '—' },
    { key: 'participacionConfirmada', header: 'Check-in', render: (i: Inscripcion) => (
      <span className={`text-xs px-2 py-1 rounded-xl ${i.participacionConfirmada ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`} data-ui="fer-checkin-badge">
        {i.participacionConfirmada ? 'Confirmado' : 'Pendiente'}
      </span>
    )},
    { key: 'totalPagado', header: 'Total', render: (i: Inscripcion) => i.totalPagado ? `${i.totalPagado}€` : '-' },
    { key: 'createdAt', header: 'Fecha', render: (i: Inscripcion) => new Date(i.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) },
    { key: 'actions', header: '', className: 'text-right w-[80px]', render: (i: Inscripcion) => (
      <div className="flex gap-1 justify-end" data-ui="fer-actions">
        <button
          onClick={() => setEditInscripcion(i)}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          data-ui="fer-edit-action"
          aria-label="Editar inscripción"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setInscripcionToDelete(i)}
          className="p-1.5 rounded-lg text-red-400/80 hover:text-red-300 hover:bg-white/10 transition-colors"
          data-ui="fer-delete-action"
          aria-label="Eliminar inscripción"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )},
  ], []);

  return (
    <>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8 pb-12 max-w-full mx-auto min-w-0 overflow-hidden" data-ui="fer-inscripciones-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="fer-page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2" data-ui="fer-page-title">Inscripciones FER</h1>
          <p className="text-sm xs:text-base text-white/50" data-ui="fer-page-subtitle">Gestiona las inscripciones de FER CUP II</p>
        </div>

        {/* Tabs */}
        <div className="mb-4 xs:mb-6 w-full overflow-x-auto scrollbar-hide" data-ui="fer-tabs-wrapper">
          <Tabs
            tabs={FER_TABS}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        </div>

        {/* Tab Content */}
        {activeTab === 'todas' ? (
        <div className="space-y-4 xs:space-y-6 min-w-0" data-ui="fer-todas-tab">
          {/* KPI Section */}
          <div className="grid grid-cols-2 xs:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-1.5 min-w-0" data-ui="fer-kpi-section">
            <KpiCard label="Inscritos" value={stats.total} className="kpi-compact" />
            <KpiCard label="Pagados" value={stats.pagados} color="success" className="kpi-compact" />
            <KpiCard label="Pendientes" value={stats.pendientes} color="warning" className="kpi-compact" />
            <KpiCard label="Check-ins" value={stats.checkins} color="success" className="kpi-compact" />
            <KpiCard label="Total €" value={formatMoney(stats.revenue)} color="success" className="kpi-compact" />
            <KpiCard
              label="Efectivo"
              value={formatMoney(stats.cashRevenue)}
              description={`${formatPercent(cashRevenuePercent)} del total`}
              color="success"
              className="kpi-compact"
            />
            <KpiCard
              label="Online"
              value={formatMoney(stats.stripeRevenue)}
              description={`${formatPercent(stripeRevenuePercent)} del total`}
              color="success"
              className="kpi-compact"
            />
          </div>

          {/* Filters */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden" data-ui="fer-filters-container">
            <FerFiltersAccordion />
          </div>

          {/* Actions Bar */}
          <div className="flex justify-between items-center mb-3 gap-2" data-ui="fer-actions-bar">
            <div className="flex gap-2" data-ui="fer-actions-bar-left">
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
                data-ui="fer-export-csv-btn"
              >
                Exportar CSV
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className={`inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150 ${exportingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-ui="fer-export-pdf-btn"
              >
                <Download className="w-4 h-4" />
                {exportingPdf ? 'Exportando...' : 'Exportar PDF'}
              </button>
            </div>
            <div className="flex gap-2" data-ui="fer-actions-bar-right">
              <SorteoInscritosButton
                competicionKind="fer"
                store={ferRaffleStore}
                dataTestid="fer-sorteo-button"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden min-w-0 mb-48" data-ui="fer-table-container">
            <div className="overflow-x-auto min-w-0">
              <ResponsiveTable
                columns={ferTableColumns}
                data={inscripciones}
                keyExtractor={(i) => i.id}
                isLoading={isLoading}
                emptyMessage="No hay inscripciones registradas"
              />
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                pageSize={pageSize}
                onPageChange={goToPage}
                onPrevPage={prevPage}
                onNextPage={nextPage}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 xs:p-6" data-ui="fer-anadir-tab">
            <h2 className="text-base xs:text-lg font-semibold text-white mb-4 xs:mb-6">Nueva Inscripción FER</h2>
            <FerInscripcionCreateForm onSubmit={handleCreateInscripcion} isLoading={isLoading} />
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editInscripcion && (
        <Modal
          isOpen={true}
          onClose={() => setEditInscripcion(null)}
          title="Editar Inscripción"
          size="xl"
          className="max-h-[90vh] overflow-y-auto"
        >
          <FerInscripcionEditForm
            inscripcion={editInscripcion}
            onSubmit={handleUpdateInscripcion}
            onCancel={() => setEditInscripcion(null)}
            isLoading={isLoading}
          />
        </Modal>
      )}

      {/* Delete Confirmation */}
      {inscripcionToDelete && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setInscripcionToDelete(null)}
          onConfirm={handleDeleteInscripcion}
          athleteName={inscripcionToDelete.nombre}
          isLoading={isLoading}
        />
      )}

      {/* Submission Loading Overlay */}
      {submissionStatus !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 backdrop-blur-md bg-black/60 transition-opacity duration-200"
          data-ui="fer-submission-overlay"
        >
          <div className="flex flex-col items-center gap-4">
            {submissionStatus === 'loading' ? (
              <div
                className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"
                data-ui="fer-submission-spinner"
              />
            ) : (
              <div
                className="w-16 h-16 flex items-center justify-center rounded-full bg-green-500/20"
                data-ui="fer-submission-success-icon"
              >
                <Check className="w-8 h-8 text-green-400" />
              </div>
            )}
            <p className="text-white text-lg font-medium" data-ui="fer-submission-text">
              {submissionStatus === 'loading' ? 'Guardando inscripción...' : 'Inscripción completada'}
            </p>
          </div>
        </div>
      )}

      {/* Sorteo Inscritos modal — gated by ferRaffleStore.raffleModalOpenAtom */}
      <SorteoInscritosModal
        competicionId={competicionId}
        competicionKind="fer"
        store={ferRaffleStore}
        poolSize={stats.total}
      />
    </>
  );
}
