import { useState, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { FileText, FileSpreadsheet, Layout, Columns } from 'lucide-react';
import { Modal, CustomSelector, Button } from '../../../../components/ui';
import type { SelectOption } from '../../../../components/ui/CustomSelector/CustomSelector';
import { OrderByDropdown } from '../components/OrderByDropdown';
import type { OrderByOption } from '../components/OrderByDropdown';
import type { ColumnOption } from '../components/ExportInscripcionesModal';

type ExportFormat = 'pdf' | 'csv';
type Orientation = 'portrait' | 'landscape';

const FER_EXPERIENCIA_OPTIONS: SelectOption<string>[] = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
];

const FER_MODALIDAD_OPTIONS: SelectOption<string>[] = [
  { value: 'completa', label: 'Completa' },
  { value: 'solo_banca', label: 'Solo Banca' },
  { value: 'solo_peso_muerto', label: 'Solo Peso Muerto' },
];

const FER_SEXO_OPTIONS: SelectOption<string>[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
];

const FER_PAYMENT_METHOD_OPTIONS: SelectOption<string>[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'stripe', label: 'Stripe' },
];

const FER_BOOL_OPTIONS: SelectOption<string>[] = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
];

const CATEGORY_OPTIONS: SelectOption<string>[] = [
  { value: '-43', label: '-43 kg' },
  { value: '-47', label: '-47 kg' },
  { value: '-52', label: '-52 kg' },
  { value: '-57', label: '-57 kg' },
  { value: '-63', label: '-63 kg' },
  { value: '-69', label: '-69 kg' },
  { value: '-76', label: '-76 kg' },
  { value: '-84', label: '-84 kg' },
  { value: '-53', label: '-53 kg (M)' },
  { value: '-59', label: '-59 kg (M)' },
  { value: '-66', label: '-66 kg (M)' },
  { value: '-74', label: '-74 kg (M)' },
  { value: '-83', label: '-83 kg (M)' },
  { value: '-93', label: '-93 kg (M)' },
  { value: '-105', label: '-105 kg (M)' },
  { value: '-120', label: '-120 kg (M)' },
  { value: '+120', label: '+120 kg (M)' },
];

const ORDER_BY_OPTIONS: OrderByOption[] = [
  { value: 'nombre', label: 'Nombre' },
  { value: 'email', label: 'Email' },
  { value: 'sexo', label: 'Sexo' },
  { value: 'categoria', label: 'Categoría' },
  { value: 'modalidad', label: 'Modalidad' },
  { value: 'experiencia', label: 'Experiencia' },
  { value: 'total', label: 'Total pagado' },
  { value: 'fecha', label: 'Fecha registro' },
];

const ALL_COLUMNS: ColumnOption[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'sex', label: 'Sexo' },
  { key: 'category', label: 'Categoría' },
  { key: 'modality', label: 'Modalidad' },
  { key: 'experience', label: 'Experiencia' },
  { key: 'pago', label: 'Pago' },
  { key: 'paymentMethod', label: 'Método Pago' },
  { key: 'coupon', label: 'Cupón' },
  { key: 'discount', label: 'Descuento' },
  { key: 'total', label: 'Total' },
  { key: 'date', label: 'Fecha' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof FileText }[] = [
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'csv', label: 'CSV', icon: FileSpreadsheet },
];

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: 'landscape', label: 'Horizontal' },
  { value: 'portrait', label: 'Vertical' },
];

interface FerExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  competicionId: number;
  onExport: (params: {
    format: ExportFormat;
    search?: string;
    pagoConfirmado?: boolean;
    experiencia?: string;
    modalidad?: string;
    paymentMethod?: string;
    sexo?: string;
    categoriaPeso?: string;
    quiereHandler?: boolean;
    quierePeakProgram?: boolean;
    participacionConfirmada?: boolean;
    hasCoupon?: boolean;
    orderBy: string;
    orderDirection: 'asc' | 'desc';
    selectedColumns: string[];
    orientation: Orientation;
  }) => void;
  isExporting?: boolean;
}

export function FerExportModal({
  isOpen,
  onClose,
  competicionId,
  onExport,
  isExporting = false,
}: FerExportModalProps): JSX.Element | null {
  const [search, setSearch] = useState('');
  const [pagoConfirmado, setPagoConfirmado] = useState<string | null>(null);
  const [experiencia, setExperiencia] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [sexo, setSexo] = useState<string | null>(null);
  const [categoriaPeso, setCategoriaPeso] = useState<string | null>(null);
  const [quiereHandler, setQuiereHandler] = useState<string | null>(null);
  const [quierePeakProgram, setQuierePeakProgram] = useState<string | null>(null);
  const [participacionConfirmada, setParticipacionConfirmada] = useState<string | null>(null);
  const [hasCoupon, setHasCoupon] = useState<string | null>(null);
  const [orderBy, setOrderBy] = useState('fecha');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(ALL_COLUMNS.map(c => c.key));

  const toggleColumn = useCallback((key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const handleExport = useCallback(() => {
    onExport({
      format,
      search: search || undefined,
      pagoConfirmado: pagoConfirmado === 'true' ? true : pagoConfirmado === 'false' ? false : undefined,
      experiencia: experiencia || undefined,
      modalidad: modalidad || undefined,
      paymentMethod: paymentMethod || undefined,
      sexo: sexo || undefined,
      categoriaPeso: categoriaPeso || undefined,
      quiereHandler: quiereHandler === 'true' ? true : quiereHandler === 'false' ? false : undefined,
      quierePeakProgram: quierePeakProgram === 'true' ? true : quierePeakProgram === 'false' ? false : undefined,
      participacionConfirmada: participacionConfirmada === 'true' ? true : participacionConfirmada === 'false' ? false : undefined,
      hasCoupon: hasCoupon === 'true' ? true : hasCoupon === 'false' ? false : undefined,
      orderBy,
      orderDirection,
      selectedColumns: selectedColumns.length > 0 ? selectedColumns : ALL_COLUMNS.map(c => c.key),
      orientation: format === 'pdf' ? orientation : 'landscape',
    });
  }, [format, search, pagoConfirmado, experiencia, modalidad, paymentMethod, sexo, categoriaPeso, quiereHandler, quierePeakProgram, participacionConfirmada, hasCoupon, orderBy, orderDirection, selectedColumns, orientation, onExport]);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setPagoConfirmado(null);
    setExperiencia(null);
    setModalidad(null);
    setPaymentMethod(null);
    setSexo(null);
    setCategoriaPeso(null);
    setQuiereHandler(null);
    setQuierePeakProgram(null);
    setParticipacionConfirmada(null);
    setHasCoupon(null);
  }, []);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar inscripciones FER"
      size="lg"
      footer={
        <div className="flex justify-end gap-3" data-ui="fer-export-modal-actions">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isExporting}
            className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10"
            data-ui="fer-export-modal-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="min-h-[48px] bg-red-accent/90 hover:bg-red-accent text-white border-0"
            data-ui="fer-export-modal-export-btn"
          >
            {isExporting ? 'Exportando...' : `Exportar ${format === 'pdf' ? 'PDF' : 'CSV'}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-ui="fer-export-modal-content">
        {/* Format selector */}
        <div data-ui="fer-export-modal-format">
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
                  data-ui={`fer-export-format-${opt.value}`}
                >
                  <Icon className="w-5 h-5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column selector */}
        <div data-ui="fer-export-modal-columns">
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
                  data-ui={`fer-export-column-${col.key}`}
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
          <div data-ui="fer-export-modal-orientation">
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
                    data-ui={`fer-export-orientation-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div data-ui="fer-export-modal-filters">
          <h4 className="text-sm font-medium text-white/70 mb-3">Filtros</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div data-ui="fer-export-filter-search">
              <label className="block text-sm text-white/60 mb-1.5">Buscar</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o email..."
                className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
                data-ui="fer-export-search-input"
              />
            </div>

            <div data-ui="fer-export-filter-sexo">
              <CustomSelector
                label="Sexo"
                options={FER_SEXO_OPTIONS}
                value={sexo}
                onChange={setSexo}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-categoria">
              <CustomSelector
                label="Categoría"
                options={CATEGORY_OPTIONS}
                value={categoriaPeso}
                onChange={setCategoriaPeso}
                placeholder="Todas"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-pago">
              <CustomSelector
                label="Pago confirmado"
                options={FER_BOOL_OPTIONS}
                value={pagoConfirmado}
                onChange={setPagoConfirmado}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-modalidad">
              <CustomSelector
                label="Modalidad"
                options={FER_MODALIDAD_OPTIONS}
                value={modalidad}
                onChange={setModalidad}
                placeholder="Todas"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-experiencia">
              <CustomSelector
                label="Experiencia"
                options={FER_EXPERIENCIA_OPTIONS}
                value={experiencia}
                onChange={setExperiencia}
                placeholder="Todas"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-payment">
              <CustomSelector
                label="Método de pago"
                options={FER_PAYMENT_METHOD_OPTIONS}
                value={paymentMethod}
                onChange={setPaymentMethod}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-handler">
              <CustomSelector
                label="Quiere handler"
                options={FER_BOOL_OPTIONS}
                value={quiereHandler}
                onChange={setQuiereHandler}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-peak">
              <CustomSelector
                label="Quiere Peak Program"
                options={FER_BOOL_OPTIONS}
                value={quierePeakProgram}
                onChange={setQuierePeakProgram}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-participacion">
              <CustomSelector
                label="Participación confirmada"
                options={FER_BOOL_OPTIONS}
                value={participacionConfirmada}
                onChange={setParticipacionConfirmada}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div data-ui="fer-export-filter-coupon">
              <CustomSelector
                label="Tiene cupón"
                options={FER_BOOL_OPTIONS}
                value={hasCoupon}
                onChange={setHasCoupon}
                placeholder="Todos"
                allowClear
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                onClick={handleClearFilters}
                className="min-h-[48px] text-white/60 hover:text-white hover:bg-white/10"
                data-ui="fer-export-clear-filters"
              >
                Limpiar filtros
              </Button>
            </div>
          </div>
        </div>

        {/* Order by */}
        <div data-ui="fer-export-modal-order">
          <OrderByDropdown
            options={ORDER_BY_OPTIONS}
            value={orderBy}
            direction={orderDirection}
            onValueChange={setOrderBy}
            onDirectionChange={setOrderDirection}
            label="Ordenar por"
          />
        </div>
      </div>
    </Modal>
  );
}

export default FerExportModal;
