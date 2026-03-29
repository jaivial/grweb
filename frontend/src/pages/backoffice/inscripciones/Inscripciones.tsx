import { useState, useCallback, useEffect, useMemo } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Tabs, KpiCard, Accordion, CustomSelector, Button, Modal, Badge, ResponsiveTable } from '../../../components/ui';
import { useAthletes } from './hooks/useAthletes';
import { AthleteForm } from './components/AthleteForm';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { Pagination } from './components/Pagination';
import { ATHLETE_STATUS_LABELS, ATHLETE_STATUS_COLORS, type Athlete } from '../../../types/athlete';
import { WOMEN_CATEGORIES, MEN_CATEGORIES } from '../../../constants/categories';

const TABS = [
  { id: 'todas', label: 'Todas las inscripciones' },
  { id: 'anadir', label: 'Añadir inscripción' },
];

const STATUS_OPTIONS = [
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

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const handleCreateAthlete = useCallback(async (data: any) => {
    await createAthlete(data);
    setActiveTab('todas');
    await refresh();
  }, [createAthlete, refresh]);

  const handleUpdateAthlete = useCallback(async (data: any) => {
    if (editAthlete) {
      await updateAthlete(editAthlete.id, data);
      setEditAthlete(null);
      await refresh();
    }
  }, [editAthlete, updateAthlete, refresh]);

  const handleDeleteAthlete = useCallback(async () => {
    if (athleteToDelete) {
      await deleteAthlete(athleteToDelete.id);
      setAthleteToDelete(null);
    }
  }, [athleteToDelete, deleteAthlete]);

  const tableColumns = useMemo(() => [
    { key: 'name', header: 'Nombre', sticky: true, render: (a: Athlete) => (
      <div>
        <div className="font-medium">{a.firstName} {a.surname}</div>
        <div className="text-xs text-gray-500">{a.email}</div>
      </div>
    )},
    { key: 'phone', header: 'Teléfono', render: (a: Athlete) => a.phone || '-' },
    { key: 'sex', header: 'Sexo', render: (a: Athlete) => (
      <span className="text-xs px-2 py-1 rounded bg-dark-hover">{a.sex === 'Male' ? 'H' : 'M'}</span>
    )},
    { key: 'weightCategory', header: 'Categoría', render: (a: Athlete) => `${a.weightCategory} kg` },
    { key: 'club', header: 'Club', render: (a: Athlete) => a.club || '-' },
    { key: 'totalWeight', header: 'Marca Total', render: (a: Athlete) => a.totalWeight ? `${a.totalWeight} kg` : '-' },
    { key: 'registrationDate', header: 'Fecha', render: (a: Athlete) => new Date(a.registrationDate).toLocaleDateString('es-ES') },
    { key: 'coach', header: 'Entrenador', render: (a: Athlete) => a.coach || '-' },
    { key: 'status', header: 'Estado', render: (a: Athlete) => (
      <span className={`text-xs px-2 py-1 rounded border ${ATHLETE_STATUS_COLORS[a.status]}`}>
        {ATHLETE_STATUS_LABELS[a.status]}
      </span>
    )},
    { key: 'actions', header: 'Acciones', className: 'text-right', render: (a: Athlete) => (
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setEditAthlete(a)}>Editar</Button>
        <Button size="sm" variant="ghost" onClick={() => setAthleteToDelete(a)} className="text-red-400 hover:text-red-300">Eliminar</Button>
      </div>
    )},
  ], []);

  return (
    <BackofficeLayout>
      <div className="p-4 lg:p-8" data-ui="inscripciones-page">
        {/* Header */}
        <div className="mb-6" data-ui="page-header">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Inscripciones</h1>
          <p className="text-gray-400">Gestiona los atletas registrados en la competición</p>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={TABS}
          activeTab={activeTab}
          onChange={handleTabChange}
          className="mb-6"
        />

        {/* Tab Content */}
        {activeTab === 'todas' ? (
          <div className="space-y-6" data-ui="todas-tab">
            {/* KPI Section */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-ui="kpi-section">
              <KpiCard label="Total" value={stats.total} />
              <KpiCard label="Pagados" value={stats.paid} color="success" />
              <KpiCard label="Pendientes" value={stats.pending} color="warning" />
              <KpiCard label="Descalificados" value={stats.disqualified} color="danger" />
              <KpiCard label="Falta Doc" value={stats.missingDocumentation} color="warning" />
            </div>

            {/* Filters */}
            <FiltersAccordion onApply={fetchAthletes} />

            {/* Table */}
            <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden" data-ui="table-container">
              <ResponsiveTable
                columns={tableColumns}
                data={athletes}
                keyExtractor={(a) => a.id}
                isLoading={isLoading}
                emptyMessage="No hay atletas registrados"
              />
              
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
          <div className="bg-dark-surface rounded-xl border border-dark-border p-6" data-ui="anadir-tab">
            <h2 className="text-lg font-semibold text-white mb-6">Nueva Inscripción</h2>
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
    </BackofficeLayout>
  );
}

function FiltersAccordion({ onApply }: { onApply: () => void }) {
  const [search, setSearch] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [weightCategory, setWeightCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [club, setClub] = useState('');

  const categoryOptions = useMemo(() => {
    if (sex === 'Female') {
      return WOMEN_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
    } else if (sex === 'Male') {
      return MEN_CATEGORIES.map(c => ({ value: c, label: `${c} kg` }));
    }
    return [];
  }, [sex]);

  const handleApply = useCallback(() => {
    // Update store filters
    athletesSearchQuery.value = search;
    athletesSexFilter.value = sex;
    athletesWeightCategoryFilter.value = weightCategory;
    athletesStatusFilter.value = status;
    athletesClubFilter.value = club;
    athletesPage.value = 1;
    onApply();
  }, [search, sex, weightCategory, status, club, onApply]);

  const handleClear = useCallback(() => {
    setSearch('');
    setSex(null);
    setWeightCategory(null);
    setStatus(null);
    setClub('');
    clearAthletesFilters();
    onApply();
  }, [onApply]);

  return (
    <Accordion title="Filtros" defaultOpen={false}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-ui="filters-grid">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre o email..."
            className="w-full px-3 py-2 bg-dark-base border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-accent"
          />
        </div>
        
        <CustomSelector
          label="Sexo"
          options={SEX_OPTIONS}
          value={sex}
          onChange={setSex}
          placeholder="Todos"
          allowClear
        />
        
        <CustomSelector
          label="Categoría"
          options={categoryOptions}
          value={weightCategory}
          onChange={setWeightCategory}
          placeholder="Todas"
          allowClear
          disabled={!sex}
        />
        
        <CustomSelector
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          placeholder="Todos"
          allowClear
        />
        
        <div>
          <label className="block text-sm text-gray-400 mb-1">Club</label>
          <input
            type="text"
            value={club}
            onChange={(e) => setClub(e.target.value)}
            placeholder="Nombre del club..."
            className="w-full px-3 py-2 bg-dark-base border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-accent"
          />
        </div>
        
        <div className="flex items-end gap-2">
          <Button onClick={handleApply}>Aplicar</Button>
          <Button variant="ghost" onClick={handleClear}>Limpiar</Button>
        </div>
      </div>
    </Accordion>
  );
}

// Re-export athletes store for filters
import { athletesSearchQuery, athletesSexFilter, athletesWeightCategoryFilter, athletesStatusFilter, athletesClubFilter, clearAthletesFilters, athletesPage } from '../../../stores/athletesStore';

export default Inscripciones;
