import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import type { JSX } from 'react';
import { Plus, Filter, ToggleLeft, ToggleRight, Edit2, Trash2, Gift } from 'lucide-react';
import { api } from '../../../utils/api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Icon } from '../../../components/ui/Icon';
import { CustomSelector } from '../../../components/ui/CustomSelector/CustomSelector';
import { Tabs } from '../../../components/ui/Tabs/Tabs';
import { KpiCard } from '../../../components/ui/KpiCard/KpiCard';
import { FallbackImage } from '../../../components/ui/FallbackImage/FallbackImage';
import { countryCodeOptions } from '../../../utils/countryCodes';
import { GiftModal } from './GiftModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

// Dynamic import for pdfExport to reduce initial bundle size
const getExportPdf = () => import('../../../utils/pdfExport').then(m => m.exportPdf);

interface Draw {
  id: number;
  winnerEmail: string;
  winnerName: string;
  winnerInstagram: string;
  winnerTicketCount: number;
  drawDate: string;
  isConfirmed: boolean;
  notes: string | null;
}

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

interface Statistics {
  totalParticipants: number;
  totalTickets: number;
  totalRevenue: number;
  cashRevenue: number;
  stripeRevenue: number;
  bankRevenue: number;
}

interface ParticipantsResponse {
  participants: Participant[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const TICKET_PRICE = 0.5;
const MAX_TICKETS = 50;

const paymentMethodOptions = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank', label: 'Transferencia' },
  { value: 'stripe', label: 'Stripe' },
];

interface ManualFormData {
  name: string;
  email: string;
  countryCode: string;
  phone: string;
  instagram: string;
  ticketCount: number;
  paymentMethod: string;
  dataConsent: boolean;
  contestPolicy: boolean;
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

interface GiftItem {
  id: number;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function Sorteo(): JSX.Element {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [currentWinner, setCurrentWinner] = useState<Draw | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [drawInProgress, setDrawInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState('sorteo');
  const [stats, setStats] = useState<Statistics | null>(null);

  // Participants tab state
  const [participantsData, setParticipantsData] = useState<ParticipantsResponse | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
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

  // Manual form state
  const [manualFormData, setManualFormData] = useState<ManualFormData>({
    name: '',
    email: '',
    countryCode: '+34',
    phone: '',
    instagram: '',
    ticketCount: 1,
    paymentMethod: 'cash',
    dataConsent: false,
    contestPolicy: false,
  });
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);

  // Submit overlay state
  const [submitOverlay, setSubmitOverlay] = useState<'idle' | 'loading' | 'success'>('idle');

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'warning' | 'error'>('success');

  // Premios tab state
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const [raffleMode, setRaffleMode] = useState<0 | 1>(0);
  const [modeSaving, setModeSaving] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftModalMode, setGiftModalMode] = useState<'create' | 'edit'>('create');
  const [editingGift, setEditingGift] = useState<GiftItem | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingGift, setDeletingGift] = useState<GiftItem | null>(null);
  const [giftFilterStatus, setGiftFilterStatus] = useState<'' | 'active' | 'inactive'>('');
  const [giftFilterSearch, setGiftFilterSearch] = useState('');
  const [giftFiltersExpanded, setGiftFiltersExpanded] = useState(false);
  const [giftSuccess, setGiftSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch participants when page, search, or filters change
  useEffect(() => {
    if (activeTab === 'participantes') {
      fetchParticipants();
    }
  }, [activeTab, currentPage, debouncedSearch, sortBy, sortOrder, filterIsPaid, filterPaymentMethod]);

  async function fetchParticipants() {
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
    } catch {
      setError('Error al cargar participantes');
    } finally {
      setParticipantsLoading(false);
    }
  }

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
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(participantsData.totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  async function handleExport() {
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

  useEffect(() => {
    fetchDraws();
    api.getStatistics().then(setStats).catch(() => {});
  }, []);

  async function fetchDraws() {
    try {
      setLoading(true);
      const data = await api.getDraws();
      setDraws(data);
      setError(null);
    } catch {
      setError('Error al cargar sorteos');
    } finally {
      setLoading(false);
    }
  }

  async function handleDraw() {
    try {
      setDrawInProgress(true);
      setError(null);
      const winner = await api.drawWinner();
      setCurrentWinner(winner);
      setShowConfirmModal(true);
      await fetchDraws();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('No participants available for draw')) {
        setToastType('warning');
        setToastMessage('No hay participantes para el sorteo');
      } else {
        setError('Error al realizar el sorteo');
      }
    } finally {
      setDrawInProgress(false);
    }
  }

  async function handleConfirm(drawId: number) {
    try {
      await api.confirmWinner(drawId);
      setShowConfirmModal(false);
      setCurrentWinner(null);
      await fetchDraws();
    } catch {
      setError('Error al confirmar el ganador');
    }
  }

  async function handleVoid(drawId: number) {
    if (!confirm('¿Seguro que quieres anular este sorteo? Esta accion no se puede deshacer.')) return;
    try {
      await api.voidDraw(drawId);
      setShowConfirmModal(false);
      setCurrentWinner(null);
      await fetchDraws();
    } catch {
      setError('Error al anular el sorteo');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  const updateManualFormData = useCallback((field: keyof ManualFormData, value: string | boolean | number) => {
    setManualFormData(prev => ({ ...prev, [field]: value }));
    if (manualErrors[field]) {
      setManualErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [manualErrors]);

  const incrementTickets = useCallback(() => {
    setManualFormData(prev => ({ ...prev, ticketCount: Math.min(prev.ticketCount + 1, MAX_TICKETS) }));
  }, []);

  const decrementTickets = useCallback(() => {
    setManualFormData(prev => ({ ...prev, ticketCount: Math.max(prev.ticketCount - 1, 1) }));
  }, []);

  const validateManualForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!manualFormData.name.trim() || manualFormData.name.trim().length < 2) {
      newErrors.name = 'El nombre debe tener al menos 2 caracteres';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!manualFormData.email.trim() || !emailRegex.test(manualFormData.email)) {
      newErrors.email = 'Introduce un correo electrónico válido';
    }

    if (!manualFormData.countryCode) {
      newErrors.countryCode = 'Selecciona un código de país';
    }

    if (!manualFormData.phone.trim() || manualFormData.phone.trim().length < 6) {
      newErrors.phone = 'Introduce un número de teléfono válido';
    }

    if (!manualFormData.dataConsent) {
      newErrors.dataConsent = 'Debes aceptar el tratamiento de tus datos';
    }

    if (!manualFormData.contestPolicy) {
      newErrors.contestPolicy = 'Debes aceptar la política del concurso';
    }

    setManualErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [manualFormData]);

  const handleManualSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateManualForm()) {
      return;
    }

    setManualSubmitting(true);
    setError(null);
    setSubmitOverlay('loading');

    try {
      const nameParts = manualFormData.name.trim().split(' ');
      const firstName = nameParts[0];
      const surname = nameParts.slice(1).join(' ') || '';

      // Optimistic KPI update
      setStats(prev => prev ? {
        ...prev,
        totalParticipants: prev.totalParticipants + 1,
        totalTickets: prev.totalTickets + manualFormData.ticketCount,
        totalRevenue: prev.totalRevenue + (manualFormData.ticketCount * TICKET_PRICE),
        cashRevenue: manualFormData.paymentMethod === 'cash'
          ? prev.cashRevenue + (manualFormData.ticketCount * TICKET_PRICE)
          : prev.cashRevenue,
        stripeRevenue: manualFormData.paymentMethod === 'stripe'
          ? prev.stripeRevenue + (manualFormData.ticketCount * TICKET_PRICE)
          : prev.stripeRevenue,
        bankRevenue: manualFormData.paymentMethod === 'bank'
          ? prev.bankRevenue + (manualFormData.ticketCount * TICKET_PRICE)
          : prev.bankRevenue,
      } : prev);

      await api.createManualParticipant({
        firstName,
        surname,
        email: manualFormData.email.trim(),
        instagram: manualFormData.instagram || '',
        ticketCount: manualFormData.ticketCount,
        price: TICKET_PRICE,
        paymentMethod: manualFormData.paymentMethod as 'cash' | 'bank' | 'stripe',
        phone: `${manualFormData.countryCode}${manualFormData.phone}`,
      });

      setSubmitOverlay('success');

      setTimeout(() => {
        setSubmitOverlay('idle');
        setManualSuccess(true);
        setManualFormData({
          name: '',
          email: '',
          countryCode: '+34',
          phone: '',
          instagram: '',
          ticketCount: 1,
          paymentMethod: 'cash',
          dataConsent: false,
          contestPolicy: false,
        });
        setTimeout(() => setManualSuccess(false), 3000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 1000);
    } catch (err) {
      setSubmitOverlay('idle');
      // Revert optimistic update
      setStats(prev => prev ? {
        ...prev,
        totalParticipants: prev.totalParticipants - 1,
        totalTickets: prev.totalTickets - manualFormData.ticketCount,
        totalRevenue: prev.totalRevenue - (manualFormData.ticketCount * TICKET_PRICE),
        cashRevenue: manualFormData.paymentMethod === 'cash'
          ? prev.cashRevenue - (manualFormData.ticketCount * TICKET_PRICE)
          : prev.cashRevenue,
        stripeRevenue: manualFormData.paymentMethod === 'stripe'
          ? prev.stripeRevenue - (manualFormData.ticketCount * TICKET_PRICE)
          : prev.stripeRevenue,
        bankRevenue: manualFormData.paymentMethod === 'bank'
          ? prev.bankRevenue - (manualFormData.ticketCount * TICKET_PRICE)
          : prev.bankRevenue,
      } : prev);
      setError('Error al crear participante');
    } finally {
      setManualSubmitting(false);
    }
  }, [manualFormData, validateManualForm]);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5006';

  async function fetchGifts() {
    try {
      setGiftsLoading(true);
      const res = await fetch(`${API_URL}/api/admin/raffle-products`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setGifts(json.data);
      }
    } catch {
    } finally {
      setGiftsLoading(false);
    }
  }

  async function fetchRaffleMode() {
    try {
      const res = await fetch(`${API_URL}/api/admin/raffle-config`, { credentials: 'include' });
      const json = await res.json();
      setRaffleMode(json.raffleMethod === 1 ? 1 : 0);
    } catch {
    }
  }

  async function handleToggleMode() {
    try {
      setModeSaving(true);
      const newMode = raffleMode === 0 ? 1 : 0;
      const res = await fetch(`${API_URL}/api/admin/raffle-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isEnabled: true, disabledMessage: null, raffleMethod: newMode }),
      });
      const json = await res.json();
      setRaffleMode(json.raffleMethod === 1 ? 1 : 0);
    } catch {
    } finally {
      setModeSaving(false);
    }
  }

  async function handleSaveGift(formData: FormData) {
    const isEdit = giftModalMode === 'edit' && editingGift;
    const url = isEdit
      ? `${API_URL}/api/admin/raffle-products/${editingGift.id}`
      : `${API_URL}/api/admin/raffle-products`;

    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      credentials: 'include',
      body: formData,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Error al guardar');
    setGiftSuccess(isEdit ? 'Premio actualizado' : 'Premio creado');
    setTimeout(() => setGiftSuccess(null), 3000);
    await fetchGifts();
  }

  async function handleToggleGiftStatus(gift: GiftItem) {
    // Optimistic update - immediately toggle locally without showing loading spinner
    const previousGifts = [...gifts];
    const previousEditingGift = editingGift;
    
    setGifts(prev => prev.map(g => 
      g.id === gift.id ? { ...g, isActive: !g.isActive } : g
    ));
    
    // Also update editingGift if it's the same gift being toggled
    if (editingGift && editingGift.id === gift.id) {
      setEditingGift(prev => prev ? { ...prev, isActive: !prev.isActive } : prev);
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/raffle-products/${gift.id}/toggle-status`, {
        method: 'PATCH',
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      // Success - we already updated UI optimistically, no need to refetch
      // The server is the source of truth and will be consistent
    } catch (err) {
      // Revert optimistic update on failure
      setGifts(previousGifts);
      if (previousEditingGift && previousEditingGift.id === gift.id) {
        setEditingGift(previousEditingGift);
      }
      setToastMessage('Error al cambiar estado del premio');
      setToastType('error');
    }
  }

  async function handleDeleteGift() {
    if (!deletingGift) return;
    try {
      await fetch(`${API_URL}/api/admin/raffle-products/${deletingGift.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeleteModalOpen(false);
      setDeletingGift(null);
      setGiftSuccess('Premio eliminado');
      setTimeout(() => setGiftSuccess(null), 3000);
      await fetchGifts();
    } catch {
    }
  }

  function openCreateModal() {
    setGiftModalMode('create');
    setEditingGift(null);
    setGiftModalOpen(true);
  }

  function openEditModal(gift: GiftItem) {
    setGiftModalMode('edit');
    setEditingGift(gift);
    setGiftModalOpen(true);
  }

  useEffect(() => {
    if (activeTab === 'premios') {
      fetchGifts();
      fetchRaffleMode();
    }
  }, [activeTab]);

  const filteredGifts = useMemo(() => {
    let result = [...gifts];
    if (giftFilterStatus === 'active') result = result.filter(g => g.isActive);
    if (giftFilterStatus === 'inactive') result = result.filter(g => !g.isActive);
    if (giftFilterSearch.trim()) {
      const q = giftFilterSearch.toLowerCase();
      result = result.filter(g => g.title.toLowerCase().includes(q) || (g.subtitle?.toLowerCase().includes(q) ?? false));
    }
    return result;
  }, [gifts, giftFilterStatus, giftFilterSearch]);

  const hasActiveFilters = giftFilterStatus !== '' || giftFilterSearch.trim() !== '';

  const tabs = [
    { id: 'sorteo', label: 'Sorteo' },
    { id: 'manual', label: 'Manual' },
    { id: 'participantes', label: 'Participantes' },
    { id: 'premios', label: 'Premios' },
  ];

  return (
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8 min-w-0" data-ui="sorteo-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1" data-ui="sorteo-page-title">Sorteo</h1>
          <p className="text-sm xs:text-base text-gray-400" data-ui="sorteo-page-subtitle">Selecciona aleatoriamente al ganador del premio</p>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-3 xs:gap-4 mb-6" data-ui="kpi-row">
          <KpiCard
            label="Participantes"
            value={stats?.totalParticipants ?? 0}
            color="default"
            className="flex-1 min-w-[140px]"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Tickets Vendidos"
            value={stats?.totalTickets ?? 0}
            color="success"
            className="flex-1 min-w-[140px]"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            }
          />
          <KpiCard
            label="Recaudacion Total"
            value={stats ? `${stats.totalRevenue.toFixed(2)} EUR` : '0.00 EUR'}
            color="warning"
            className="flex-1 min-w-[140px]"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Recaudacion Efectivo"
            value={stats ? `${stats.cashRevenue.toFixed(2)} EUR` : '0.00 EUR'}
            color="default"
            className="flex-1 min-w-[140px]"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Recaudacion Stripe"
            value={stats ? `${stats.stripeRevenue.toFixed(2)} EUR` : '0.00 EUR'}
            color="success"
            className="flex-1 min-w-[140px]"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            }
          />
        </div>

        {/* Tabs */}
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="mb-6"
        />

        {/* Submit Overlay */}
        {submitOverlay !== 'idle' && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-dark-bg/95 backdrop-blur-sm" data-ui="submit-overlay">
             <div className="text-center" data-ui="submit-overlay-content">
              {submitOverlay === 'loading' ? (
                <>
                  <div className="w-16 h-16 border-4 border-white/20 border-t-red-accent rounded-full animate-spin mb-6 mx-auto" data-ui="submit-spinner" />
                  <p className="text-white text-xl font-semibold" data-ui="submit-loading-text">Creando participante...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-6 mx-auto" data-ui="submit-success-icon">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="submit-success-check">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-white text-xl font-semibold" data-ui="submit-success-text">Participante creado!</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 xs:p-4 mb-4 xs:mb-6 flex items-start gap-3" data-ui="sorteo-error-alert">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="sorteo-error-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400 text-sm" data-ui="sorteo-error-text">{error}</p>
          </div>
        )}

        {/* Toast */}
        {toastMessage && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-right ${
              toastType === 'success' ? 'bg-green-500/90 text-white' :
              toastType === 'warning' ? 'bg-yellow-500/90 text-black' :
              'bg-red-500/90 text-white'
            }`}
            data-ui="toast-notification"
          >
            {toastType === 'warning' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="toast-warning-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="toast-success-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <p className="text-sm font-medium" data-ui="toast-text">{toastMessage}</p>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 hover:opacity-70 transition-opacity"
              data-testid="toast-dismiss-btn"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="toast-dismiss-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {activeTab === 'sorteo' && (
          <>
            {/* Draw Section */}
            <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-4 xs:p-6 sm:p-8 mb-6 xs:mb-8" data-ui="draw-section">
              <div className="text-center" data-ui="draw-content">
                <div className="mb-4 xs:mb-6" data-ui="draw-header">
                  <div className="inline-flex items-center justify-center w-16 h-16 xs:w-20 xs:h-20 rounded-full bg-gradient-to-br from-red-accent to-dark-red mb-3 xs:mb-4" data-ui="draw-icon">
                    <svg className="w-8 h-8 xs:w-10 xs:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="draw-clock-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg xs:text-xl sm2:text-2xl font-bold text-white mb-1.5 xs:mb-2" data-ui="draw-title">Listo para sortear?</h2>
                  <p className="text-gray-400 max-w-md mx-auto text-sm xs:text-base" data-ui="draw-description">
                    Haz clic en el boton para seleccionar aleatoriamente al ganador. La seleccion es ponderada por tickets.
                  </p>
                </div>

                <button
                  onClick={handleDraw}
                  disabled={drawInProgress}
                  className="inline-flex items-center justify-center gap-2 xs:gap-3 px-6 xs:px-8 py-3 xs:py-4 sm:py-5 bg-gradient-to-r from-red-accent to-dark-red text-white text-base xs:text-lg font-bold rounded-xl xs:rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px] sm:min-h-[60px]"
                  data-testid="draw-winner-btn"
                >
                  {drawInProgress ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" data-ui="draw-spinner" />
                      Sorteando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="draw-btn-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Seleccionar Ganador
                    </>
                  )}
                </button>

                <p className="text-gray-500 text-xs xs:text-sm mt-3 xs:mt-4" data-ui="draw-hint">
                  El ganador se selecciona de todos los participantes con al menos 1 ticket
                </p>
              </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && currentWinner && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 xs:p-4" data-ui="confirm-modal-overlay">
                <div className="bg-dark-surface border border-white/10 rounded-2xl p-4 xs:p-6 sm:p-8 max-w-md w-full" data-ui="confirm-modal-card">
                  <div className="text-center mb-4 xs:mb-6" data-ui="confirm-modal-header">
                    <div className="inline-flex items-center justify-center w-16 h-16 xs:w-20 xs:h-20 rounded-full bg-gradient-to-br from-dark-red to-red-accent mb-3 xs:mb-4" data-ui="confirm-modal-icon">
                      <svg className="w-8 h-8 xs:w-10 xs:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="confirm-star-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <h3 className="text-xl xs:text-2xl font-bold text-white mb-2" data-ui="confirm-modal-title">Ganador Seleccionado!</h3>
                  </div>

                  <div className="bg-black/20 rounded-xl p-4 xs:p-6 mb-4 xs:mb-6 text-center" data-ui="confirm-modal-winner-info">
                    <p className="text-2xl xs:text-3xl font-bold text-white mb-1.5 xs:mb-2" data-ui="confirm-winner-name">{currentWinner.winnerName}</p>
                    <p className="text-red-accent text-base xs:text-lg mb-2 xs:mb-3" data-ui="confirm-winner-instagram">@{currentWinner.winnerInstagram?.replace('@', '')}</p>
                    <div className="flex items-center justify-center gap-4 xs:gap-6 text-sm" data-ui="confirm-winner-stats">
                      <div data-ui="confirm-winner-tickets">
                        <p className="text-gray-500" data-ui="confirm-winner-tickets-label">Tickets</p>
                        <p className="text-white font-bold text-lg xs:text-xl" data-ui="confirm-winner-tickets-value">{currentWinner.winnerTicketCount}</p>
                      </div>
                      <div className="w-px h-8 bg-white/10 hidden xs:block" data-ui="confirm-winner-divider" />
                      <div data-ui="confirm-winner-email">
                        <p className="text-gray-500" data-ui="confirm-winner-email-label">Email</p>
                        <p className="text-gray-300 text-xs xs:text-sm" data-ui="confirm-winner-email-value">{currentWinner.winnerEmail}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 xs:gap-3" data-ui="confirm-modal-actions">
                    <button
                      onClick={() => handleConfirm(currentWinner.id)}
                      className="flex-1 px-4 xs:px-6 py-2.5 xs:py-3 bg-green-500/10 border border-green-500/30 text-green-400 font-bold rounded-lg hover:bg-green-500/20 transition-colors min-h-[44px] text-sm xs:text-base"
                      data-testid="confirm-winner-btn"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => handleVoid(currentWinner.id)}
                      className="flex-1 px-4 xs:px-6 py-2.5 xs:py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-bold rounded-lg hover:bg-red-500/20 transition-colors min-h-[44px] text-sm xs:text-base"
                      data-testid="void-winner-btn"
                    >
                      Anular y re-sorteo
                    </button>
                  </div>
                </div>
              </div>
            )}

         
           

            {/* Info Cards */}
            <div className="mt-4 xs:mt-6 grid grid-cols-1 xs:grid-cols-1 sm2:grid-cols-2 md:grid-cols-3 gap-3 xs:gap-4" data-ui="info-cards">
              <div className="p-4 xs:p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="info-card-weighted">
                <div className="flex items-center gap-2.5 xs:gap-3 mb-2 xs:mb-3" data-ui="info-card-weighted-header">
                  <div className="w-8 h-8 xs:w-9 xs:h-9 rounded-lg bg-white/5 flex items-center justify-center" data-ui="info-card-weighted-icon">
                    <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-card-weighted-svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xs xs:text-sm font-bold text-white" data-ui="info-card-weighted-title">Seleccion Ponderada</h3>
                </div>
                <p className="text-gray-400 text-xs xs:text-sm" data-ui="info-card-weighted-desc">
                  Los ganadores se seleccionan aleatoriamente con probabilidad ponderada por tickets. Mas tickets = mayor probabilidad.
                </p>
              </div>
              <div className="p-4 xs:p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="info-card-log">
                <div className="flex items-center gap-2.5 xs:gap-3 mb-2 xs:mb-3" data-ui="info-card-log-header">
                  <div className="w-8 h-8 xs:w-9 xs:h-9 rounded-lg bg-white/5 flex items-center justify-center" data-ui="info-card-log-icon">
                    <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-card-log-svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-xs xs:text-sm font-bold text-white" data-ui="info-card-log-title">Registro Completo</h3>
                </div>
                <p className="text-gray-400 text-xs xs:text-sm" data-ui="info-card-log-desc">
                  Todos los sorteos quedan registrados con timestamps. Se pueden anular si es necesario.
                </p>
              </div>
              <div className="p-4 xs:p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl sm2:col-span-2 md:col-span-1" data-ui="info-card-confirm">
                <div className="flex items-center gap-2.5 xs:gap-3 mb-2 xs:mb-3" data-ui="info-card-confirm-header">
                  <div className="w-8 h-8 xs:w-9 xs:h-9 rounded-lg bg-white/5 flex items-center justify-center" data-ui="info-card-confirm-icon">
                    <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-card-confirm-svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xs xs:text-sm font-bold text-white" data-ui="info-card-confirm-title">Confirmacion</h3>
                </div>
                <p className="text-gray-400 text-xs xs:text-sm" data-ui="info-card-confirm-desc">
                  Los ganadores deben confirmarse antes de finalizarse. Se puede volver a sortear si es necesario.
                </p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'participantes' && (
          <Fragment>
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
                onClick={handleExport}
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
                {(sortBy !== 'createdAt' || sortOrder !== 'desc' || filterIsPaid !== '' || filterPaymentMethod !== '' || searchTerm !== '') && (
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
          </Fragment>
        )}

        {activeTab === 'manual' && (
          <>
            <form onSubmit={handleManualSubmit} className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-4 xs:p-6 sm:p-8" data-ui="manual-form" data-testid="manual-participant-form">
              <h2 className="text-lg xs:text-xl font-bold text-white mb-6" data-ui="manual-form-title">Añadir Participante Manual</h2>
              <div className="space-y-6" data-ui="manual-form-fields">
                <Input
                  label="Nombre completo"
                  type="text"
                  name="name"
                  placeholder="Tu nombre y apellidos"
                  value={manualFormData.name}
                  onChange={(e) => updateManualFormData('name', e.target.value)}
                  error={manualErrors.name}
                  fullWidth
                />
                <Input
                  label="Correo electrónico"
                  type="email"
                  name="email"
                  placeholder="tu@email.com"
                  value={manualFormData.email}
                  onChange={(e) => updateManualFormData('email', e.target.value)}
                  error={manualErrors.email}
                  fullWidth
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-ui="manual-phone-field">
                  <div className="sm:col-span-1">
                    <CustomSelector
                      label="Código"
                      options={countryCodeOptions}
                      value={manualFormData.countryCode}
                      onChange={(value) => updateManualFormData('countryCode', value as string)}
                      placeholder="+34"
                      searchable
                      allowClear={false}
                      error={manualErrors.countryCode}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      label="Teléfono"
                      type="tel"
                      name="phone"
                      placeholder="123 456 789"
                      value={manualFormData.phone}
                      onChange={(e) => updateManualFormData('phone', e.target.value)}
                      error={manualErrors.phone}
                      fullWidth
                    />
                  </div>
                </div>
                <Input
                  label="Instagram (opcional)"
                  type="text"
                  name="instagram"
                  placeholder="@tu_usuario"
                  value={manualFormData.instagram}
                  onChange={(e) => updateManualFormData('instagram', e.target.value)}
                  fullWidth
                />
                <div data-ui="manual-payment-field">
                  <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="manual-payment-label">Método de pago</label>
                  <CustomSelector
                    options={paymentMethodOptions}
                    value={manualFormData.paymentMethod}
                    onChange={(value) => updateManualFormData('paymentMethod', value as string)}
                    allowClear={false}
                  />
                </div>
                <div className="py-6 border-t border-b border-gray-700" data-ui="manual-tickets-section">
                  <div className="flex items-center justify-between mb-4" data-ui="manual-tickets-header">
                    <span className="text-gray-300 font-medium" data-ui="manual-tickets-label">Número de boletos</span>
                    <span className="text-gray-500 text-sm" data-ui="manual-tickets-price">{TICKET_PRICE} € por boleto</span>
                  </div>
                  <div className="flex items-center justify-center gap-6" data-ui="manual-ticket-controls">
                    <button
                      type="button"
                      onClick={decrementTickets}
                      disabled={manualFormData.ticketCount <= 1}
                      className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      aria-label="Reducir tickets"
                      data-testid="manual-ticket-minus-btn"
                    >
                      <Icon name="minus" size="lg" className="text-white" />
                    </button>
                    <div className="text-5xl font-bold text-white min-w-[80px] text-center" data-ui="manual-ticket-count">
                      {manualFormData.ticketCount}
                    </div>
                    <button
                      type="button"
                      onClick={incrementTickets}
                      disabled={manualFormData.ticketCount >= MAX_TICKETS}
                      className="w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      aria-label="Aumentar tickets"
                      data-testid="manual-ticket-plus-btn"
                    >
                      <Icon name="plus" size="lg" className="text-white" />
                    </button>
                  </div>
                  <div className="flex justify-center gap-2 mt-4" data-ui="manual-ticket-quick-select">
                    {[1, 5, 10, 20].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setManualFormData(prev => ({ ...prev, ticketCount: num }))}
                        className={`px-3 py-1 text-sm rounded-full transition-colors ${
                          manualFormData.ticketCount === num
                            ? 'bg-red-accent text-black font-medium'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                        data-testid={`manual-ticket-quick-${num}`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between py-4" data-ui="manual-summary">
                  <span className="text-xl text-gray-300" data-ui="manual-summary-detail">
                    {manualFormData.ticketCount} boleto{manualFormData.ticketCount !== 1 ? 's' : ''} × {TICKET_PRICE} €
                  </span>
                  <span className="text-3xl font-bold text-white" data-ui="manual-summary-price">
                    €{(manualFormData.ticketCount * TICKET_PRICE).toFixed(2)}
                  </span>
                </div>
                <div className="space-y-4 pt-4 border-t border-gray-700" data-ui="manual-legal-section">
                  <div className="flex items-start gap-3" data-ui="manual-data-consent">
                    <input
                      type="checkbox"
                      id="manual-data-consent"
                      checked={manualFormData.dataConsent}
                      onChange={(e) => updateManualFormData('dataConsent', e.target.checked)}
                      className="mt-1 w-5 h-5 rounded border-gray-600 bg-dark-card text-red-accent focus:ring-red-accent focus:ring-offset-0 cursor-pointer"
                      data-testid="manual-data-consent-checkbox"
                    />
                    <div className="flex-1" data-ui="manual-data-consent-content">
                      <label htmlFor="manual-data-consent" className="text-gray-300 cursor-pointer" data-ui="manual-data-consent-label">
                        He leído y acepto la{' '}
                        <a href="/consentimiento-datos" target="_blank" rel="noopener noreferrer" className="text-red-accent hover:underline" data-ui="manual-data-consent-link">
                          política de tratamiento de mis datos
                        </a>
                      </label>
                      {manualErrors.dataConsent && (
                        <p className="text-red-400 text-sm mt-1" data-ui="manual-data-consent-error">{manualErrors.dataConsent}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3" data-ui="manual-contest-policy">
                    <input
                      type="checkbox"
                      id="manual-contest-policy"
                      checked={manualFormData.contestPolicy}
                      onChange={(e) => updateManualFormData('contestPolicy', e.target.checked)}
                      className="mt-1 w-5 h-5 rounded border-gray-600 bg-dark-card text-red-accent focus:ring-red-accent focus:ring-offset-0 cursor-pointer"
                      data-testid="manual-contest-policy-checkbox"
                    />
                    <div className="flex-1" data-ui="manual-contest-policy-content">
                      <label htmlFor="manual-contest-policy" className="text-gray-300 cursor-pointer" data-ui="manual-contest-policy-label">
                        He leído y estoy de acuerdo con la{' '}
                        <a href="/politica-concurso" target="_blank" rel="noopener noreferrer" className="text-red-accent hover:underline" data-ui="manual-contest-policy-link">
                          política del concurso
                        </a>
                      </label>
                      {manualErrors.contestPolicy && (
                        <p className="text-red-400 text-sm mt-1" data-ui="manual-contest-policy-error">{manualErrors.contestPolicy}</p>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="xl"
                  fullWidth
                  isLoading={manualSubmitting}
                  disabled={manualSubmitting}
                  className="shadow-lg shadow-red-accent/30"
                  data-testid="manual-submit-btn"
                >
                  Crear Participante
                </Button>
              </div>
            </form>
          </>
        )}

        {activeTab === 'premios' && (
          <Fragment>
            {giftSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-4 flex items-center gap-3" data-ui="gift-success-toast">
                <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-400 text-sm">{giftSuccess}</p>
              </div>
            )}

            {/* Mode Toggle */}
            <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-4 xs:p-6 mb-6" data-ui="premios-mode-section">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" data-ui="premios-mode-row">
                <div data-ui="premios-mode-info">
                  <h3 className="text-base xs:text-lg font-bold text-white mb-1" data-ui="premios-mode-title">Modo del Sorteo</h3>
                  <p className="text-gray-500 text-xs xs:text-sm" data-ui="premios-mode-desc">
                    Controla la visibilidad de los premios personalizados en la página pública
                  </p>
                </div>
                <div className="flex items-center gap-3" data-ui="premios-mode-toggle-row">
                  <span className="text-sm text-gray-400" data-ui="premios-mode-default-label">Por defecto</span>
                  <button
                    onClick={handleToggleMode}
                    disabled={modeSaving}
                    className="relative inline-flex items-center cursor-pointer"
                    data-testid="custom-mode-toggle"
                    data-ui="premios-mode-toggle-btn"
                  >
                    {raffleMode === 1 ? (
                      <ToggleRight className="w-12 h-8 text-red-accent" />
                    ) : (
                      <ToggleLeft className="w-12 h-8 text-gray-500" />
                    )}
                  </button>
                  <span className="text-sm text-gray-400" data-ui="premios-mode-custom-label">Personalizado</span>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                      raffleMode === 1
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-white/5 text-gray-500'
                    }`}
                    data-testid="mode-label"
                    data-ui="premios-mode-label"
                  >
                    {raffleMode === 1 ? 'Personalizado' : 'Por defecto'}
                  </span>
                </div>
              </div>
            </div>

            {/* Filters + Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4" data-ui="premios-toolbar">
              <button
                onClick={() => setGiftFiltersExpanded(!giftFiltersExpanded)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-lg transition-colors"
                data-testid="gifts-filter-accordion"
                data-ui="premios-filter-toggle"
              >
                <Filter className="w-4 h-4" />
                Filtros
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-bold text-white bg-gradient-to-r from-red-accent to-dark-red rounded-xl hover:opacity-90 transition-opacity"
                data-testid="add-gift-btn"
                data-ui="premios-add-btn"
              >
                <Plus className="w-4 h-4" />
                Añadir Premio
              </button>
            </div>

            {/* Filters Expanded */}
            {giftFiltersExpanded && (
              <div className="bg-dark-surface/50 border border-white/5 rounded-xl p-4 mb-4 space-y-3" data-ui="premios-filters-panel">
                <div className="flex flex-wrap items-center gap-3" data-ui="premios-filters-row">
                  <div data-ui="premios-filter-status-wrapper">
                    <CustomSelector
                      label="Estado"
                      options={[
                        { value: '', label: 'Todos' },
                        { value: 'active', label: 'Activos' },
                        { value: 'inactive', label: 'Inactivos' },
                      ]}
                      value={giftFilterStatus}
                      onChange={(v) => setGiftFilterStatus(v as '' | 'active' | 'inactive')}
                      allowClear={false}
                      className="min-w-[130px]"
                      data-testid="gift-filter-status"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]" data-ui="premios-filter-search-wrapper">
                    <input
                      type="text"
                      value={giftFilterSearch}
                      onInput={(e) => setGiftFilterSearch((e.target as HTMLInputElement).value)}
                      placeholder="Buscar por título o subtítulo..."
                      className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50"
                      data-testid="gift-filter-search"
                      data-ui="premios-filter-search-input"
                    />
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setGiftFilterStatus(''); setGiftFilterSearch(''); }}
                      className="px-3 py-2 text-sm text-red-accent bg-red-accent/10 border border-red-accent/20 rounded-lg hover:bg-red-accent/20 transition-colors"
                      data-testid="gift-filter-clear"
                      data-ui="premios-filter-clear"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Gifts Grid */}
            {giftsLoading ? (
              <div className="flex items-center justify-center py-16" data-ui="premios-loading">
                <div className="w-10 h-10 border-4 border-white/20 border-t-red-accent rounded-full animate-spin" data-ui="premios-spinner" />
              </div>
            ) : filteredGifts.length === 0 ? (
              <div className="bg-dark-surface/50 border border-white/5 rounded-xl p-12 text-center" data-testid="gifts-empty-state" data-ui="premios-empty">
                <Gift className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 text-base" data-ui="premios-empty-text">
                  {gifts.length === 0 ? 'No hay premios todavía. Añade el primero.' : 'No hay premios que coincidan con los filtros.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4" data-testid="gifts-grid" data-ui="premios-grid">
                {filteredGifts.map((gift) => (
                  <div
                    key={gift.id}
                    className="flex-1 min-w-[260px] max-w-[400px] bg-dark-surface/50 border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-colors cursor-pointer"
                    data-testid={`gift-card-${gift.id}`}
                    data-ui={`premios-card-${gift.id}`}
                    onClick={() => openEditModal(gift)}
                  >
                    <FallbackImage
                      src={gift.imageUrl}
                      alt={gift.title}
                      className="h-40"
                      iconClassName="w-12 h-12"
                    />
                    <div className="p-4" data-ui={`premios-card-info-${gift.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-2" data-ui={`premios-card-header-${gift.id}`}>
                        <h4 className="text-sm font-bold text-white line-clamp-1" data-testid="gift-title" data-ui={`premios-card-title-${gift.id}`}>{gift.title}</h4>
                        <span
                          className={`px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0 ${
                            gift.isActive
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-yellow-500/10 text-yellow-400'
                          }`}
                          data-testid="gift-status-badge"
                          data-ui={`premios-card-badge-${gift.id}`}
                        >
                          {gift.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      {gift.subtitle && (
                        <p className="text-gray-500 text-xs line-clamp-2 mb-3" data-ui={`premios-card-subtitle-${gift.id}`}>{gift.subtitle}</p>
                      )}
                      <div className="flex items-center gap-2" data-ui={`premios-card-actions-${gift.id}`}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleGiftStatus(gift); }}
                          className={`p-2 rounded-lg transition-colors ${
                            gift.isActive
                              ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                          }`}
                          title={gift.isActive ? 'Desactivar' : 'Activar'}
                          data-testid="gift-toggle-status-btn"
                          data-ui={`premios-card-toggle-${gift.id}`}
                        >
                          {gift.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(gift); }}
                          className="p-2 bg-white/5 hover:bg-white/[0.08] text-gray-300 rounded-lg transition-colors"
                          title="Editar"
                          data-testid="gift-edit-btn"
                          data-ui={`premios-card-edit-${gift.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingGift(gift); setDeleteModalOpen(true); }}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                          title="Eliminar"
                          data-testid="gift-delete-btn"
                          data-ui={`premios-card-delete-${gift.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Gift Modal */}
            <GiftModal
              mode={giftModalMode}
              gift={editingGift ? {
                id: editingGift.id,
                title: editingGift.title,
                subtitle: editingGift.subtitle || '',
                imageUrl: editingGift.imageUrl,
                isActive: editingGift.isActive,
              } : null}
              isOpen={giftModalOpen}
              onClose={() => { setGiftModalOpen(false); setEditingGift(null); }}
              onSave={handleSaveGift}
              onToggleStatus={giftModalMode === 'edit' && editingGift ? () => handleToggleGiftStatus(editingGift) : undefined}
              onDelete={giftModalMode === 'edit' && editingGift ? () => { setGiftModalOpen(false); setDeletingGift(editingGift); setDeleteModalOpen(true); } : undefined}
            />

            {giftSuccess && giftModalOpen === false && (
              <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-500/90 text-white rounded-xl shadow-lg" data-testid="gift-saved-success" data-ui="gift-success-popup">
                <p className="text-sm font-medium">{giftSuccess}</p>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
              isOpen={deleteModalOpen}
              giftTitle={deletingGift?.title || ''}
              onClose={() => { setDeleteModalOpen(false); setDeletingGift(null); }}
              onConfirm={handleDeleteGift}
            />
          </Fragment>
        )}
      </div>

  );
}

export default Sorteo;
