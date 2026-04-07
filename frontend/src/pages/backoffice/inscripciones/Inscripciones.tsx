import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Tabs, KpiCard, Accordion, CustomSelector, Button, Modal, Badge, ResponsiveTable } from '../../../components/ui';
import { useAthletes } from './hooks/useAthletes';
import { AthleteForm } from './components/AthleteForm';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { Pagination } from './components/Pagination';
import { ATHLETE_STATUS_LABELS, ATHLETE_STATUS_COLORS, type Athlete } from '../../../types/athlete';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../../constants/categories';
import { api } from '../../../utils/api';
import { IoMaleSharp, IoFemaleSharp } from "react-icons/io5";
import { Lock, Unlock, Pencil, Trash2, Check } from 'lucide-react';
import {
  athletesSearchQueryAtom,
  athletesSexFilterAtom,
  athletesWeightCategoryFilterAtom,
  athletesStatusFilterAtom,
  athletesClubFilterAtom,
  athletesPageAtom,
  clearAthletesFiltersAtom,
} from '../../../stores/athletesStore';

// Dynamic import for pdfExport to reduce initial bundle size
const getExportPdf = () => import('../../../utils/pdfExport').then(m => m.exportPdf);

interface InscripcionPreparadaData {
  dateTime: string | null;
  preparadas: boolean;
}

interface ResponsableUrlData {
  value: boolean;
  url: string | null;
  dateModified: string | null;
}

const TABS = [
  { id: 'todas', label: 'Todas las inscripciones' },
  { id: 'anadir', label: 'Añadir inscripción' },
];

const STATUS_OPTIONS = [
  { value: 'Inscrito', label: 'Inscrito' },
  { value: 'Paid', label: 'Pagado' },
  { value: 'PendingPayment', label: 'Pendiente pago' },
  { value: 'Disqualified', label: 'Descalificado' },
  { value: 'MissingDocumentation', label: 'Falta documentación' },
];

const SEX_OPTIONS = [
  { value: 'Male', label: 'Hombre' },
  { value: 'Female', label: 'Mujer' },
];

export function Inscripciones(): JSX.Element {
  const [activeTab, setActiveTab] = useState('todas');
  const [editAthlete, setEditAthlete] = useState<Athlete | null>(null);
  const [athleteToDelete, setAthleteToDelete] = useState<Athlete | null>(null);
  const [preparadas, setPreparadas] = useState<InscripcionPreparadaData | null>(null);
  const [loadingPreparadas, setLoadingPreparadas] = useState(true);
  const [savingPreparadas, setSavingPreparadas] = useState(false);
  const [responsableUrl, setResponsableUrl] = useState<ResponsableUrlData | null>(null);
  const [loadingResponsableUrl, setLoadingResponsableUrl] = useState(true);
  const [savingResponsableUrl, setSavingResponsableUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlSaved, setUrlSaved] = useState(false);
  const [clubs, setClubs] = useState<string[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const {
    athletes,
    stats,
    isLoading,
    error,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    fetchAthletes,
    createAthlete,
    updateAthlete,
    deleteAthlete,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  } = useAthletes();

  useEffect(() => {
    if (activeTab === 'todas') {
      fetchAthletes();
    }
  }, []);

  // Fetch inscripciones preparadas and responsable/URL status on mount
  useEffect(() => {
    const startTime = Date.now();
    const fetchData = async () => {
      try {
        const [preparadasData, responsableUrlData] = await Promise.all([
          api.getInscripcionPreparada(),
          api.getResponsableUrlInscripciones(),
        ]);
        setPreparadas(preparadasData);
        setResponsableUrl(responsableUrlData);
        setUrlInput(responsableUrlData.url || '');
      } catch (error) {
        console.error('Error fetching data:', error);
        setPreparadas({ dateTime: null, preparadas: false });
        setResponsableUrl({ value: true, url: null, dateModified: null });
        setUrlInput('');
      } finally {
        // Ensure minimum 1 second loading for better UX
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 1000 - elapsed);
        setTimeout(() => {
          setLoadingPreparadas(false);
          setLoadingResponsableUrl(false);
        }, remaining);
      }
    };
    fetchData();
  }, []);

  // Fetch clubs for filter
  useEffect(() => {
    const fetchClubs = async () => {
      try {
        const data = await api.getClubs();
        setClubs(data);
      } catch (error) {
        console.error('Error fetching clubs:', error);
      } finally {
        setLoadingClubs(false);
      }
    };
    fetchClubs();
  }, []);

  // Re-fetch when page changes
  useEffect(() => {
    if (activeTab === 'todas') {
      fetchAthletes();
    }
  }, [currentPage]);

  // Watch filter atoms and fetch when they change
  const searchQuery = useAtomValue(athletesSearchQueryAtom);
  const sexFilter = useAtomValue(athletesSexFilterAtom);
  const weightCategoryFilter = useAtomValue(athletesWeightCategoryFilterAtom);
  const statusFilter = useAtomValue(athletesStatusFilterAtom);
  const clubFilter = useAtomValue(athletesClubFilterAtom);

  useEffect(() => {
    if (activeTab === 'todas') {
      fetchAthletes(1, {
        search: searchQuery || undefined,
        sex: sexFilter || undefined,
        weightCategory: weightCategoryFilter || undefined,
        status: statusFilter || undefined,
        club: clubFilter || undefined,
      });
    }
  }, [searchQuery, sexFilter, weightCategoryFilter, statusFilter, clubFilter]);

  const handleTogglePreparadas = useCallback(async () => {
    if (!preparadas) return;
    try {
      setSavingPreparadas(true);
      await api.updateInscripcionPreparada({
        dateTime: preparadas.dateTime,
        preparadas: !preparadas.preparadas,
      });
      setPreparadas(prev => prev ? { ...prev, preparadas: !prev.preparadas } : null);
    } catch (error) {
      console.error('Error updating inscripciones preparadas:', error);
    } finally {
      setSavingPreparadas(false);
    }
  }, [preparadas]);

  const handleToggleResponsable = useCallback(async () => {
    if (!responsableUrl) return;
    try {
      setSavingResponsableUrl(true);
      await api.updateResponsableUrlInscripciones({
        value: !responsableUrl.value,
        url: responsableUrl.url,
      });
      setResponsableUrl(prev => prev ? { ...prev, value: !prev.value } : null);
    } catch (error) {
      console.error('Error updating responsable:', error);
    } finally {
      setSavingResponsableUrl(false);
    }
  }, [responsableUrl]);

  const handleSaveUrl = useCallback(async (url: string) => {
    if (!responsableUrl) return;
    try {
      setSavingResponsableUrl(true);
      setUrlSaved(false);
      await api.updateResponsableUrlInscripciones({
        value: responsableUrl.value,
        url: url,
      });
      setResponsableUrl(prev => prev ? { ...prev, url } : null);
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 3000);
    } catch (error) {
      console.error('Error updating URL:', error);
    } finally {
      setSavingResponsableUrl(false);
    }
  }, [responsableUrl]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const handleCreateAthlete = useCallback(async (data: any) => {
    setSubmissionStatus('loading');
    try {
      await createAthlete(data);
      setSubmissionStatus('success');
      setActiveTab('todas');
      await refresh();
      setTimeout(() => setSubmissionStatus('idle'), 2000);
    } catch {
      setSubmissionStatus('idle');
    }
  }, [createAthlete, refresh]);

  const handleUpdateAthlete = useCallback(async (data: any) => {
    if (editAthlete) {
      setSubmissionStatus('loading');
      try {
        await updateAthlete(editAthlete.id, data);
        setSubmissionStatus('success');
        setEditAthlete(null);
        await refresh();
        setTimeout(() => setSubmissionStatus('idle'), 2000);
      } catch {
        setSubmissionStatus('idle');
      }
    }
  }, [editAthlete, updateAthlete, refresh]);

  const handleDeleteAthlete = useCallback(async () => {
    if (athleteToDelete) {
      await deleteAthlete(athleteToDelete.id);
      setAthleteToDelete(null);
    }
  }, [athleteToDelete, deleteAthlete]);

  const handleExportPdf = useCallback(async () => {
    const columns = [
      { header: 'Nombre', dataKey: 'name' },
      { header: 'Email', dataKey: 'email' },
      { header: 'Telf', dataKey: 'phone' },
      { header: 'Sexo', dataKey: 'sex' },
      { header: 'Categoría', dataKey: 'category' },
      { header: 'Club', dataKey: 'club' },
      { header: 'Marca', dataKey: 'weight' },
      { header: 'Fecha', dataKey: 'date' },
      { header: 'Estado', dataKey: 'status' },
    ];
    const rows = athletes.map(a => ({
      name: `${a.firstName} ${a.surname}`,
      email: a.email,
      phone: a.phone || '-',
      sex: a.sex === 'Male' ? 'Hombre' : 'Mujer',
      category: `${a.weightCategory} KG`,
      club: a.club || '-',
      weight: a.totalWeight ? `${a.totalWeight}` : '-',
      date: a.registrationDate,
      status: ATHLETE_STATUS_LABELS[a.status],
    }));
    const exportPdf = await getExportPdf();
    exportPdf({
      title: 'Inscripciones',
      columns,
      rows,
      filename: 'inscripciones',
    });
  }, [athletes]);

  const tableColumns = useMemo(() => [
    { key: 'name', header: 'Nombre', sticky: true, render: (a: Athlete) => (
      <div className="truncate">
        <div className="font-medium truncate text-white">{a.firstName} {a.surname}</div>
        <div className="text-xs text-white/50 truncate">{a.email}</div>
      </div>
    )},
    { key: 'phone', header: 'Telf.', render: (a: Athlete) => a.phone || '-' },
    { key: 'sex', header: 'Sexo', render: (a: Athlete) => (
      <span className="text-xs px-2 py-1.5 rounded-xl bg-white/10 text-white/70 inline-flex items-center gap-1">
        {a.sex === 'Male' ? (
          <><IoMaleSharp className="w-4 h-4 text-blue-600" />H</>
        ) : (
          <><IoFemaleSharp className="w-4 h-4 text-pink-300" />M</>
        )}
      </span>
    )},
    { key: 'weightCategory', header: 'Cat.', render: (a: Athlete) => `${a.weightCategory}` },
    { key: 'club', header: 'Club', render: (a: Athlete) => a.club || '-' },
    { key: 'totalWeight', header: 'Marca', render: (a: Athlete) => a.totalWeight ? `${a.totalWeight}` : '-' },
    { key: 'registrationDate', header: 'Fecha', render: (a: Athlete) => new Date(a.registrationDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) },
    { key: 'coach', header: 'Entrenador', render: (a: Athlete) => a.coach || '-' },
    { key: 'status', header: 'Estado', render: (a: Athlete) => (
      <span className={`text-xs px-2 py-1 rounded-xl ${ATHLETE_STATUS_COLORS[a.status]}`}>
        {ATHLETE_STATUS_LABELS[a.status]}
      </span>
    )},
    { key: 'actions', header: '', className: 'text-right w-[80px]', render: (a: Athlete) => (
      <div className="flex gap-1 justify-end">
        <button
          onClick={() => setEditAthlete(a)}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          data-ui="edit-action"
          aria-label="Editar atleta"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setAthleteToDelete(a)}
          className="p-1.5 rounded-lg text-red-400/80 hover:text-red-300 hover:bg-white/10 transition-colors"
          data-ui="delete-action"
          aria-label="Eliminar atleta"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )},
  ], []);

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8 pb-12 max-w-full mx-auto min-w-0 overflow-hidden" data-ui="inscripciones-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2">Inscripciones</h1>
          <p className="text-sm xs:text-base text-white/50">Gestiona los atletas registrados en la competición</p>
        </div>

        {/* Prepared Toggle */}
        {(loadingPreparadas || loadingResponsableUrl) && (
          <div className="flex items-center justify-center py-8 mb-4" data-ui="loading-spinner">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}

        {!loadingPreparadas && !loadingResponsableUrl && (
          <div className="mb-4 p-4 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="prepared-toggle-card">
            <div className="flex items-center justify-between gap-3" data-ui="prepared-toggle-row">
              <div className="flex items-center gap-3 min-w-0">
                {preparadas?.preparadas ? (
                  <Unlock className="w-6 h-6 shrink-0 text-green-400" />
                ) : (
                  <Lock className="w-6 h-6 shrink-0 text-gray-500" />
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    Inscripciones preparadas
                  </h2>
                  <p className="text-sm text-gray-400">
                    {preparadas?.preparadas
                      ? 'Las inscripciones están activas y visibles para los usuarios'
                      : 'Las inscripciones no están listas todavía'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleTogglePreparadas}
                disabled={savingPreparadas}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
                  preparadas?.preparadas ? 'bg-green-500' : 'bg-gray-600'
                } ${savingPreparadas ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-ui="prepared-toggle-button"
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                    preparadas?.preparadas ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Responsable Toggle - only show when inscripciones are prepared */}
        {!loadingResponsableUrl && !loadingPreparadas && preparadas?.preparadas && (
          <div className="mb-4 p-4 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="responsable-toggle-card">
            <div className="flex items-center justify-between gap-3" data-ui="responsable-toggle-row">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                  {responsableUrl?.value ? (
                    <span className="text-green-400 font-bold text-sm">GR</span>
                  ) : (
                    <span className="text-blue-400 font-bold text-sm">AEP</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    Gerencia de inscripciones
                  </h2>
                  <p className="text-sm text-gray-400">
                    {responsableUrl?.value
                      ? 'GRStrength gestiona las inscripciones'
                      : 'AEP gestiona las inscripciones'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleResponsable}
                disabled={savingResponsableUrl}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
                  responsableUrl?.value ? 'bg-green-500' : 'bg-blue-500'
                } ${savingResponsableUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-ui="responsable-toggle-button"
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                    responsableUrl?.value ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* AEP URL Input - shown when responsable is false */}
            {!responsableUrl?.value && (
              <div className="mt-4 pt-4 border-t border-white/10" data-ui="aep-url-section">
                <label className="block text-sm text-white/60 mb-2">
                  URL para inscripciones de la AEP
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-4 py-3 min-h-[48px] bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
                  />
                  <Button
                    onClick={() => handleSaveUrl(urlInput)}
                    disabled={savingResponsableUrl || !urlInput}
                    className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0"
                  >
                    Guardar
                  </Button>
                </div>
                {urlSaved && (
                  <p className="mt-2 text-sm text-green-400 flex items-center gap-1.5" data-ui="url-saved-confirmation">
                    <Check className="w-4 h-4" />
                    URL guardada correctamente
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fallback when not prepared OR not GRStrength responsable */}
        {!loadingPreparadas && !loadingResponsableUrl && (!preparadas?.preparadas || !responsableUrl?.value) && (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl mb-6" data-ui="inscripciones-not-ready">
            <Lock className="w-16 h-16 text-gray-500 mb-4" />
            <p className="text-gray-400 max-w-md text-center px-4">
              {!responsableUrl?.value
                ? 'Las inscripciones están siendo gestionadas por la AEP. Configura la URL de la AEP arriba.'
                : 'Las inscripciones no están listas todavía. Abre o desbloquea las inscripciones con el interruptor de arriba. Esto permitirá activar el periodo de inscripciones en la web de los clientes.'}
            </p>
          </div>
        )}

        {/* Tabs - wrapper with overflow for horizontal scroll */}
        <div className="mb-4 xs:mb-6 w-full overflow-x-auto scrollbar-hide">
          <Tabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        </div>

        {/* Tab Content */}
        {activeTab === 'todas' ? (
          <div className="space-y-4 xs:space-y-6 min-w-0" data-ui="todas-tab">
            {/* KPI Section */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 min-w-0" data-ui="kpi-section">
              <KpiCard label="Total" value={stats.total} className="kpi-compact" />
              <KpiCard label="Pagados" value={stats.paid} color="success" className="kpi-compact" />
              <KpiCard label="Pendientes" value={stats.pending} color="warning" className="kpi-compact" />
              <KpiCard label="Descalif." value={stats.disqualified} color="danger" className="kpi-compact" />
              <KpiCard label="Falta Doc" value={stats.missingDocumentation} color="warning" className="kpi-compact" />
            </div>

            {/* Filters */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden">
              <FiltersAccordion clubs={clubs} />
            </div>

            {/* Table */}
            <div className="flex justify-start mb-3">
              <button
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar PDF
              </button>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl min-w-0 mb-24" data-ui="table-container">
              <div className="overflow-x-auto min-w-0">
                <ResponsiveTable
                  columns={tableColumns}
                  data={athletes}
                  keyExtractor={(a) => a.id}
                  isLoading={isLoading}
                  emptyMessage="No hay atletas registrados"
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
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 xs:p-6" data-ui="anadir-tab">
            <h2 className="text-base xs:text-lg font-semibold text-white mb-4 xs:mb-6">Nueva Inscripción</h2>
            <AthleteForm onSubmit={handleCreateAthlete} isLoading={isLoading} />
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editAthlete && (
        <Modal
          isOpen={true}
          onClose={() => setEditAthlete(null)}
          title="Editar Atleta"
          size="xl"
          className="max-h-[90vh] overflow-y-auto"
        >
          <AthleteForm
            initialData={editAthlete}
            onSubmit={handleUpdateAthlete}
            isLoading={isLoading}
            onCancel={() => setEditAthlete(null)}
          />
        </Modal>
      )}

      {/* Delete Confirmation */}
      {athleteToDelete && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setAthleteToDelete(null)}
          onConfirm={handleDeleteAthlete}
          athleteName={`${athleteToDelete.firstName} ${athleteToDelete.surname}`}
          isLoading={isLoading}
        />
      )}

      {/* Submission Loading Overlay */}
      {submissionStatus !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 backdrop-blur-md bg-black/60 transition-opacity duration-200"
          data-ui="submission-overlay"
        >
          <div className="flex flex-col items-center gap-4">
            {submissionStatus === 'loading' ? (
              <div
                className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"
                data-ui="submission-spinner"
              />
            ) : (
              <div
                className="w-16 h-16 flex items-center justify-center rounded-full bg-green-500/20"
                data-ui="submission-success-icon"
              >
                <Check className="w-8 h-8 text-green-400" />
              </div>
            )}
            <p className="text-white text-lg font-medium">
              {submissionStatus === 'loading' ? 'Guardando inscripción...' : 'Inscripción completada'}
            </p>
          </div>
        </div>
      )}
    </BackofficeLayout>
  );
}

function FiltersAccordion({ clubs }: { clubs: string[] }) {
  const [search, setSearch] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [weightCategory, setWeightCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [club, setClub] = useState<string | null>(null);

  const [, setSearchQuery] = useAtom(athletesSearchQueryAtom);
  const [, setSexFilter] = useAtom(athletesSexFilterAtom);
  const [, setWeightCategoryFilter] = useAtom(athletesWeightCategoryFilterAtom);
  const [, setStatusFilter] = useAtom(athletesStatusFilterAtom);
  const [, setClubFilter] = useAtom(athletesClubFilterAtom);
  const [, setPage] = useAtom(athletesPageAtom);
  const [, clearFilters] = useAtom(clearAthletesFiltersAtom);

  const categoryOptions = useMemo(() => {
    if (sex === 'Female') {
      return WOMEN_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
    } else if (sex === 'Male') {
      return MEN_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
    }
    return [];
  }, [sex]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setSearchQuery(value);
    setPage(1);
  }, [setSearchQuery, setPage]);

  const handleSexChange = useCallback((value: string | null) => {
    setSex(value);
    setSexFilter(value);
    setPage(1);
  }, [setSexFilter, setPage]);

  const handleWeightCategoryChange = useCallback((value: string | null) => {
    setWeightCategory(value);
    setWeightCategoryFilter(value);
    setPage(1);
  }, [setWeightCategoryFilter, setPage]);

  const handleStatusChange = useCallback((value: string | null) => {
    setStatus(value);
    setStatusFilter(value);
    setPage(1);
  }, [setStatusFilter, setPage]);

  const handleClubChange = useCallback((value: string | null) => {
    setClub(value);
    setClubFilter(value);
    setPage(1);
  }, [setClubFilter, setPage]);

  const handleClear = useCallback(() => {
    setSearch('');
    setSex(null);
    setWeightCategory(null);
    setStatus(null);
    setClub(null);
    clearFilters();
  }, [clearFilters]);

  return (
    <Accordion title="Filtros" defaultOpen={false}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-ui="filters-grid">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Nombre o email..."
            className="w-full px-4 py-3 min-h-[48px] bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
          />
        </div>

        <CustomSelector
          label="Sexo"
          options={SEX_OPTIONS}
          value={sex}
          onChange={handleSexChange}
          placeholder="Todos"
          allowClear
        />

        <CustomSelector
          label="Categoría"
          options={categoryOptions}
          value={weightCategory}
          onChange={handleWeightCategoryChange}
          placeholder="Todas"
          allowClear
          disabled={!sex}
        />

        <CustomSelector
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={handleStatusChange}
          placeholder="Todos"
          allowClear
        />

        <CustomSelector
          label="Club"
          options={clubs.map(c => ({ value: c, label: c }))}
          value={club}
          onChange={handleClubChange}
          placeholder="Todos"
          allowClear
        />

        <div className="flex items-end gap-3">
          <Button variant="ghost" onClick={handleClear} className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10">Limpiar</Button>
        </div>
      </div>
    </Accordion>
  );
}

export default Inscripciones;
