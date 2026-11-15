import { useEffect, useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { api } from '../../../utils/api';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { CustomSelector } from '../../../components/ui/CustomSelector/CustomSelector';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';

// Dynamic import for pdfExport to reduce initial bundle size
const getExportPdf = () => import('../../../utils/pdfExport').then(m => m.exportPdf);

interface Participant {
  id: number;
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  totalPaid: number;
  createdAt: string;
  phone?: string;
  price?: number;
  isPaid?: boolean;
  paymentMethod?: string;
}

interface ParticipantsResponse {
  participants: Participant[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface EditFormData {
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  phone: string;
  price: number;
  isPaid: boolean;
  paymentMethod: string;
}

const TICKET_PRICE = 0.5;

export function Participantes(): JSX.Element {
  const [participantsData, setParticipantsData] = useState<ParticipantsResponse | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'ticketCount' | 'name' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterIsPaid, setFilterIsPaid] = useState<'' | 'true' | 'false'>('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<'' | 'cash' | 'bank' | 'stripe'>('');
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    firstName: '',
    surname: '',
    email: '',
    instagram: '',
    ticketCount: 1,
    phone: '',
    price: TICKET_PRICE,
    isPaid: true,
    paymentMethod: 'stripe',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch participants when page, search, or filters change
  const fetchParticipants = useCallback(async () => {
    try {
      setParticipantsLoading(true);
      const response = await api.getParticipants({
        page: currentPage,
        search: debouncedSearch || undefined,
        sortBy,
        sortOrder,
        isPaid: filterIsPaid !== '' ? filterIsPaid === 'true' : undefined,
        paymentMethod: filterPaymentMethod !== '' ? filterPaymentMethod : undefined,
      });
      setParticipantsData(response);
      setError(null);
    } catch {
      setError('Error al cargar participantes');
    } finally {
      setParticipantsLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder, filterIsPaid, filterPaymentMethod]);

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  function resetFilters() {
    setSortBy('createdAt');
    setSortOrder('desc');
    setFilterIsPaid('');
    setFilterPaymentMethod('');
    setSearchTerm('');
    setCurrentPage(1);
  }

  async function handleDeleteParticipant(id: number) {
    if (!confirm('¿Seguro que quieres eliminar este participante?')) return;
    try {
      await api.deleteParticipant(id);
      await fetchParticipants();
    } catch {
      setError('Error al eliminar participante');
    }
  }

  function handleEditParticipant(p: Participant) {
    setEditingParticipant(p);
    setEditFormData({
      firstName: p.firstName,
      surname: p.surname,
      email: p.email,
      instagram: p.instagram,
      ticketCount: p.ticketCount,
      phone: p.phone || '',
      price: p.price || TICKET_PRICE,
      isPaid: p.isPaid ?? true,
      paymentMethod: p.paymentMethod || 'stripe',
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingParticipant) return;

    setEditSubmitting(true);
    try {
      await api.updateParticipant(editingParticipant.id, {
        firstName: editFormData.firstName,
        surname: editFormData.surname,
        email: editFormData.email,
        instagram: editFormData.instagram,
        ticketCount: editFormData.ticketCount,
        price: editFormData.price,
        isPaid: editFormData.isPaid,
        paymentMethod: editFormData.paymentMethod,
        phone: editFormData.phone,
      });
      setEditingParticipant(null);
      await fetchParticipants();
    } catch {
      setError('Error al actualizar participante');
    } finally {
      setEditSubmitting(false);
    }
  }

  function getPageNumbers() {
    if (!participantsData) return [];
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(participantsData.totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  async function handleExportCsv() {
    try {
      await api.exportCsv();
    } catch {
      setError('Error al exportar CSV');
    }
  }

  async function handleExportPdf() {
    if (!participantsData) return;
    const columns = [
      { header: 'Nombre', dataKey: 'name' },
      { header: 'Email', dataKey: 'email' },
      { header: 'Instagram', dataKey: 'instagram' },
      { header: 'Tickets', dataKey: 'tickets' },
      { header: 'Pagado', dataKey: 'paid' },
      { header: 'Método', dataKey: 'method' },
    ];
    const rows = participantsData.participants.map(p => ({
      name: `${p.firstName} ${p.surname}`,
      email: p.email,
      instagram: `@${p.instagram.replace('@', '')}`,
      tickets: p.ticketCount,
      paid: p.isPaid ? 'Sí' : 'No',
      method: p.paymentMethod === 'cash' ? 'Efectivo' : p.paymentMethod === 'bank' ? 'Transferencia' : 'Stripe',
    }));
    const exportPdf = await getExportPdf();
    exportPdf({
      title: 'Participantes del Sorteo',
      columns,
      rows,
      filename: 'participantes-sorteo',
    });
  }

  const hasActiveFilters = useMemo(() =>
    sortBy !== 'createdAt' || sortOrder !== 'desc' || filterIsPaid !== '' || filterPaymentMethod !== '' || searchTerm !== '',
    [sortBy, sortOrder, filterIsPaid, filterPaymentMethod, searchTerm]
  );

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8 min-w-0" data-ui="participantes-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1" data-ui="participantes-page-title">Participantes</h1>
          <p className="text-sm xs:text-base text-gray-400" data-ui="participantes-page-subtitle">Administra las entradas del sorteo y exporta datos</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 xs:p-4 mb-4 xs:mb-6 flex items-start gap-3" data-ui="participantes-error-alert">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="error-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400 text-sm" data-ui="error-text">{error}</p>
          </div>
        )}

        {/* Header with Export */}
        <div className="mb-4 flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4" data-ui="participants-header">
          <div data-ui="participants-header-info">
            <h2 className="text-lg xs:text-xl font-bold text-white" data-ui="participants-title">Lista de Participantes</h2>
            <p className="text-gray-500 text-sm" data-ui="participants-count">{participantsData?.totalCount || 0} participantes en total</p>
          </div>
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
            data-testid="export-pdf-btn"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="export-pdf-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
            data-testid="export-csv-btn"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="export-csv-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV
          </button>
        </div>

        {/* Search */}
        <div className="mb-4" data-ui="participants-search-section">
          <div className="flex flex-wrap items-center gap-2 xs:gap-3" data-ui="participants-filter-bar">
            <CustomSelector
              label="Ordenar por"
              options={[
                { value: 'createdAt', label: 'Fecha' },
                { value: 'ticketCount', label: 'Tickets' },
                { value: 'name', label: 'Nombre' },
              ]}
              value={sortBy}
              onChange={(v) => { setSortBy(v as typeof sortBy); setCurrentPage(1); }}
              allowClear={false}
              className="min-w-[130px]"
            />
            <CustomSelector
              label="Dirección"
              options={[
                { value: 'desc', label: 'Descendente' },
                { value: 'asc', label: 'Ascendente' },
              ]}
              value={sortOrder}
              onChange={(v) => { setSortOrder(v as typeof sortOrder); setCurrentPage(1); }}
              allowClear={false}
              className="min-w-[130px]"
            />
            <CustomSelector
              label="Método"
              options={[
                { value: '', label: 'Todos' },
                { value: 'cash', label: 'Efectivo' },
                { value: 'bank', label: 'Transferencia' },
                { value: 'stripe', label: 'Stripe' },
              ]}
              value={filterPaymentMethod}
              onChange={(v) => { setFilterPaymentMethod(v as typeof filterPaymentMethod); setCurrentPage(1); }}
              allowClear={false}
              className="min-w-[140px]"
            />
            <CustomSelector
              label="Estado"
              options={[
                { value: '', label: 'Todos' },
                { value: 'true', label: 'Pagados' },
                { value: 'false', label: 'No pagados' },
              ]}
              value={filterIsPaid}
              onChange={(v) => { setFilterIsPaid(v as typeof filterIsPaid); setCurrentPage(1); }}
              allowClear={false}
              className="min-w-[130px]"
            />
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="self-end mb-0.5 px-3 py-2 min-h-[40px] text-sm font-medium text-red-accent bg-red-accent/10 border border-red-accent/20 rounded-lg hover:bg-red-accent/20 transition-colors whitespace-nowrap"
                data-testid="reset-filters-btn"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="relative mt-3" data-ui="participants-search-wrapper">
            <div className="absolute inset-y-0 left-0 pl-3 xs:pl-4 flex items-center pointer-events-none" data-ui="search-icon-wrapper">
              <svg className="w-4 h-4 xs:w-5 xs:h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="search-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
              placeholder="Buscar por nombre, email o Instagram..."
              className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20 transition-colors"
              data-testid="participants-search-input"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 xs:pr-4 flex items-center text-gray-500 hover:text-white transition-colors min-h-[44px]"
                data-testid="search-clear-btn"
              >
                <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="search-clear-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Edit Modal */}
        {editingParticipant && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 xs:p-4 overflow-y-auto" data-ui="edit-modal-overlay">
            <div className="bg-dark-surface border border-white/10 rounded-2xl p-4 xs:p-6 sm:p-8 max-w-md w-full my-8" data-ui="edit-modal-card">
              <h3 className="text-xl font-bold text-white mb-6" data-ui="edit-modal-title">Editar Participante</h3>
              <form onSubmit={handleSaveEdit} className="space-y-4" data-testid="edit-participant-form">
                <Input
                  label="Nombre"
                  value={editFormData.firstName}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  fullWidth
                />
                <Input
                  label="Apellidos"
                  value={editFormData.surname}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, surname: e.target.value }))}
                  fullWidth
                />
                <Input
                  label="Email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                  fullWidth
                />
                <Input
                  label="Instagram"
                  value={editFormData.instagram}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, instagram: e.target.value }))}
                  fullWidth
                />
                <Input
                  label="Teléfono"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                  fullWidth
                />
                <div data-ui="edit-field-tickets">
                  <label className="block text-sm font-medium text-gray-300 mb-1" data-ui="edit-tickets-label">Boletos</label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.ticketCount}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, ticketCount: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
                    data-testid="edit-tickets-input"
                  />
                </div>
                <div className="flex items-center gap-3" data-ui="edit-field-paid">
                  <input
                    type="checkbox"
                    id="edit-isPaid"
                    checked={editFormData.isPaid}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, isPaid: e.target.checked }))}
                    className="w-5 h-5 rounded border-gray-600 bg-dark-card text-red-accent"
                    data-testid="edit-isPaid-checkbox"
                  />
                  <label htmlFor="edit-isPaid" className="text-gray-300" data-ui="edit-isPaid-label">Pagado</label>
                </div>
                <div className="flex gap-3 pt-4" data-ui="edit-modal-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingParticipant(null)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={editSubmitting}
                    className="flex-1"
                  >
                    Guardar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        {participantsLoading ? (
          <div className="p-8 xs:p-12 text-center text-gray-500" data-ui="participants-loading">Cargando...</div>
        ) : !participantsData || participantsData.participants.length === 0 ? (
          <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-xl p-8 xs:p-12 text-center text-gray-500" data-ui="participants-empty">
            {searchTerm ? 'Sin resultados para la búsqueda' : 'Sin participantes todavía'}
          </div>
        ) : (
          <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-xl overflow-hidden min-w-0 mb-12" data-ui="participants-table-wrapper">
            <div className="overflow-x-auto min-w-0" data-ui="participants-table-scroll">
              <table className="w-full min-w-[700px]" data-ui="participants-table">
                <thead data-ui="participants-table-head">
                  <tr className="border-b border-white/5" data-ui="participants-table-header-row">
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-left text-xs font-semibold text-gray-400 uppercase" data-ui="th-name">Nombre</th>
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-left text-xs font-semibold text-gray-400 uppercase" data-ui="th-email">Email</th>
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-left text-xs font-semibold text-gray-400 uppercase" data-ui="th-instagram">Instagram</th>
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-center text-xs font-semibold text-gray-400 uppercase" data-ui="th-tickets">Tickets</th>
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-center text-xs font-semibold text-gray-400 uppercase" data-ui="th-paid">Pagado</th>
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-center text-xs font-semibold text-gray-400 uppercase" data-ui="th-method">Metodo</th>
                    <th className="px-4 xs:px-6 py-3 xs:py-4 text-right text-xs font-semibold text-gray-400 uppercase" data-ui="th-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5" data-ui="participants-table-body">
                  {participantsData.participants.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors" data-ui={`participant-row-${p.id}`}>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-white font-medium text-sm xs:text-base" data-ui={`participant-name-${p.id}`}>{p.firstName} {p.surname}</td>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-gray-400 text-xs xs:text-sm" data-ui={`participant-email-${p.id}`}>{p.email}</td>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-red-accent text-xs xs:text-sm" data-ui={`participant-instagram-${p.id}`}>@{p.instagram.replace('@', '')}</td>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-center" data-ui={`participant-tickets-${p.id}`}>
                        <span className="px-2 xs:px-3 py-0.5 xs:py-1 inline-flex text-xs xs:text-sm font-bold rounded-full bg-white/5 text-gray-300" data-ui={`participant-tickets-badge-${p.id}`}>
                          {p.ticketCount}
                        </span>
                      </td>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-center" data-ui={`participant-paid-${p.id}`}>
                        {p.isPaid ? (
                          <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-500/10 text-green-400" data-ui={`paid-yes-${p.id}`}>Sí</span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-500/10 text-yellow-400" data-ui={`paid-no-${p.id}`}>No</span>
                        )}
                      </td>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-center" data-ui={`participant-method-${p.id}`}>
                        {p.paymentMethod === 'stripe' ? (
                          <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-500/10 text-purple-400" data-ui={`method-stripe-${p.id}`}>Stripe</span>
                        ) : p.paymentMethod === 'cash' ? (
                          <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-500/10 text-green-400" data-ui={`method-cash-${p.id}`}>Efectivo</span>
                        ) : p.paymentMethod === 'bank' ? (
                          <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-500/10 text-blue-400" data-ui={`method-bank-${p.id}`}>Transferencia</span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-bold rounded-full bg-white/5 text-gray-500" data-ui={`method-unknown-${p.id}`}>-</span>
                        )}
                      </td>
                      <td className="px-4 xs:px-6 py-3 xs:py-4 text-right" data-ui={`participant-actions-${p.id}`}>
                        <div className="flex items-center justify-end gap-2" data-ui={`participant-actions-row-${p.id}`}>
                          <button
                            onClick={() => handleEditParticipant(p)}
                            className="p-2 min-h-[36px] min-w-[36px] bg-white/5 hover:bg-white/[0.08] text-gray-300 rounded-lg transition-colors text-xs xs:text-sm"
                            title="Editar"
                            data-testid="edit-participant-btn"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="edit-participant-icon">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteParticipant(p.id)}
                            className="p-2 min-h-[36px] min-w-[36px] bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-xs xs:text-sm"
                            title="Eliminar"
                            data-testid="delete-participant-btn"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="delete-participant-icon">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {participantsData.totalPages > 1 && (
              <div className="p-4 xs:p-6 border-t border-white/5 flex flex-col xs:flex-row items-center justify-between gap-3 xs:gap-4" data-ui="participants-pagination">
                <div className="text-gray-400 text-xs xs:text-sm" data-ui="pagination-info">
                  Mostrando {((currentPage - 1) * participantsData.pageSize) + 1} - {Math.min(currentPage * participantsData.pageSize, participantsData.totalCount)} de {participantsData.totalCount}
                </div>
                <div className="flex items-center gap-1 xs:gap-2" data-ui="pagination-controls">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 xs:px-4 py-2 min-h-[40px] xs:min-h-[44px] bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid="pagination-prev-btn"
                  >
                    <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="pagination-prev-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {getPageNumbers().map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-2.5 xs:px-4 py-2 min-h-[40px] xs:min-h-[44px] rounded-lg font-medium transition-all text-sm ${
                        page === currentPage
                          ? 'bg-red-accent text-white'
                          : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/[0.08]'
                      }`}
                      data-testid={`pagination-page-${page}`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(Math.min(participantsData.totalPages, currentPage + 1))}
                    disabled={currentPage === participantsData.totalPages}
                    className="px-2.5 xs:px-4 py-2 min-h-[40px] xs:min-h-[44px] bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid="pagination-next-btn"
                  >
                    <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="pagination-next-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}

export default Participantes;
