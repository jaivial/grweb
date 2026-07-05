import { useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { FileText, FileSpreadsheet, Layout, Columns } from 'lucide-react';
import { Modal, CustomSelector, Button } from '../../../../components/ui';
import type { SelectOption } from '../../../../components/ui/CustomSelector/CustomSelector';
import { OrderByDropdown } from './OrderByDropdown';
import type { OrderByOption } from './OrderByDropdown';
import { WOMEN_CATEGORIES, MEN_CATEGORIES, ALL_CATEGORIES } from '../../../../constants/categories';

type ExportFormat = 'pdf' | 'csv';
type Orientation = 'portrait' | 'landscape';

export interface ColumnOption {
  key: string;
  label: string;
}

const STATUS_OPTIONS: SelectOption<string>[] = [
  { value: 'Inscrito', label: 'Inscrito' },
  { value: 'Paid', label: 'Pagado' },
  { value: 'PendingPayment', label: 'Pendiente pago' },
  { value: 'Disqualified', label: 'Descalificado' },
  { value: 'MissingDocumentation', label: 'Falta documentación' },
];

const SEX_OPTIONS: SelectOption<string>[] = [
  { value: 'Male', label: 'Hombre' },
  { value: 'Female', label: 'Mujer' },
];

const ORDER_BY_OPTIONS: OrderByOption[] = [
  { value: 'name', label: 'Nombre' },
  { value: 'email', label: 'Email' },
  { value: 'sex', label: 'Sexo' },
  { value: 'weightCategory', label: 'Categoría' },
  { value: 'club', label: 'Club' },
  { value: 'totalWeight', label: 'Marca' },
  { value: 'registrationDate', label: 'Fecha registro' },
  { value: 'status', label: 'Estado' },
];

const ALL_COLUMNS: ColumnOption[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'sex', label: 'Sexo' },
  { key: 'category', label: 'Categoría' },
  { key: 'club', label: 'Club' },
  { key: 'weight', label: 'Marca' },
  { key: 'date', label: 'Fecha' },
  { key: 'status', label: 'Estado' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof FileText }[] = [
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'csv', label: 'CSV', icon: FileSpreadsheet },
];

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: 'landscape', label: 'Horizontal' },
  { value: 'portrait', label: 'Vertical' },
];

interface ExportInscripcionesModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: string[];
  initialFilters?: {
    search?: string;
    sex?: string | null;
    weightCategory?: string | null;
    status?: string | null;
    club?: string | null;
  };
  onExport: (params: {
    format: ExportFormat;
    search?: string;
    sex?: string;
    weightCategory?: string;
    status?: string;
    club?: string;
    orderBy: string;
    orderDirection: 'asc' | 'desc';
    selectedColumns: string[];
    orientation: Orientation;
  }) => void;
  isExporting?: boolean;
}

export function ExportInscripcionesModal({
  isOpen,
  onClose,
  clubs,
  initialFilters,
  onExport,
  isExporting = false,
}: ExportInscripcionesModalProps): JSX.Element | null {
  const [search, setSearch] = useState(initialFilters?.search || '');
  const [sex, setSex] = useState<string | null>(initialFilters?.sex || null);
  const [weightCategory, setWeightCategory] = useState<string | null>(initialFilters?.weightCategory || null);
  const [status, setStatus] = useState<string | null>(initialFilters?.status || null);
  const [club, setClub] = useState<string | null>(initialFilters?.club || null);
  const [orderBy, setOrderBy] = useState('registrationDate');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(ALL_COLUMNS.map(c => c.key));

  const categoryOptions = useMemo<SelectOption<string>[]>(() => {
    if (sex === 'Male') return MEN_CATEGORIES.map(c => ({ value: c, label: c }));
    if (sex === 'Female') return WOMEN_CATEGORIES.map(c => ({ value: c, label: c }));
    return ALL_CATEGORIES.map(c => ({ value: c, label: c }));
  }, [sex]);

  const toggleColumn = useCallback((key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const handleExport = useCallback(() => {
    onExport({
      format,
      search: search || undefined,
      sex: sex || undefined,
      weightCategory: weightCategory || undefined,
      status: status || undefined,
      club: club || undefined,
      orderBy,
      orderDirection,
      selectedColumns: selectedColumns.length > 0 ? selectedColumns : ALL_COLUMNS.map(c => c.key),
      orientation: format === 'pdf' ? orientation : 'landscape',
    });
  }, [format, search, sex, weightCategory, status, club, orderBy, orderDirection, selectedColumns, orientation, onExport]);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setSex(null);
    setWeightCategory(null);
    setStatus(null);
    setClub(null);
  }, []);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar inscripciones"
      size="lg"
      footer={
        <div className="flex justify-end gap-3" data-ui="export-modal-actions">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isExporting}
            className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10"
            data-ui="export-modal-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0"
            data-ui="export-modal-export-btn"
          >
            {isExporting ? 'Exportando...' : `Exportar ${format === 'pdf' ? 'PDF' : 'CSV'}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-ui="export-modal-content">
        {/* Format selector */}
        <div data-ui="export-modal-format">
          <label className="block text-sm text-white/60 mb-2">Formato</label>
          <div className="flex gap-3">
            {FORMAT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isSelected = format === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] text-sm font-medium rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-red-accent/20 border-red-accent/50 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white'
                  }`}
                  data-ui={`export-format-${opt.value}`}
                >
                  <Icon className="w-5 h-5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column selector */}
        <div data-ui="export-modal-columns">
          <div className="flex items-center gap-2 mb-3">
            <Columns className="w-4 h-4 text-white/60" />
            <h4 className="text-sm font-medium text-white/70">Columnas</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_COLUMNS.map(col => {
              const isChecked = selectedColumns.includes(col.key);
              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                    isChecked
                      ? 'bg-red-accent/10 border-red-accent/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/[0.08]'
                  }`}
                  data-ui={`export-column-${col.key}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleColumn(col.key)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 accent-red-accent"
                  />
                  <span>{col.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Orientation selector - PDF only */}
        {format === 'pdf' && (
          <div data-ui="export-modal-orientation">
            <div className="flex items-center gap-2 mb-3">
              <Layout className="w-4 h-4 text-white/60" />
              <h4 className="text-sm font-medium text-white/70">Orientación</h4>
            </div>
            <div className="flex gap-3">
              {ORIENTATION_OPTIONS.map(opt => {
                const isSelected = orientation === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOrientation(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-sm font-medium rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-red-accent/20 border-red-accent/50 text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white'
                    }`}
                    data-ui={`export-orientation-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div data-ui="export-modal-filters">
          <h4 className="text-sm font-medium text-white/70 mb-3">Filtros</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div data-ui="export-modal-filter-search">
              <label className="block text-sm text-white/60 mb-1.5">Buscar</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o email..."
                className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
                data-ui="export-modal-search-input"
              />
            </div>

            <div data-ui="export-modal-filter-sex">
              <CustomSelector
                label="Sexo"
                options={SEX_OPTIONS}
                value={sex}
                onChange={setSex}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="export-modal-filter-category">
              <CustomSelector
                label="Categoría"
                options={categoryOptions}
                value={weightCategory}
                onChange={setWeightCategory}
                placeholder="Todas"
                allowClear
              />
            </div>

            <div data-ui="export-modal-filter-status">
              <CustomSelector
                label="Estado"
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="export-modal-filter-club">
              <CustomSelector
                label="Club"
                options={clubs.map(c => ({ value: c, label: c }))}
                value={club}
                onChange={setClub}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                onClick={handleClearFilters}
                className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10"
                data-ui="export-modal-clear-filters"
              >
                Limpiar filtros
              </Button>
            </div>
          </div>
        </div>

        {/* Order by */}
        <div data-ui="export-modal-order">
          <OrderByDropdown
            options={ORDER_BY_OPTIONS}
            value={orderBy}
            direction={orderDirection}
            onValueChange={setOrderBy}
            onDirectionChange={setOrderDirection}
          />
        </div>
      </div>
    </Modal>
  );
}

export default ExportInscripcionesModal;
