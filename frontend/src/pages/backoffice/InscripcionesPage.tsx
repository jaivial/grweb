import { useEffect, useState, useMemo, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useAtomValue } from 'jotai';
import { currentCompeticionIdAtom } from '../../stores/auth.atoms';
import { useInscripciones } from '../../hooks/useInscripciones';
import { usePermissions } from '../../hooks/usePermissions';
import api from '../../api/client';
import type { Competicion } from '../../types/api';
import { 
  Search, 
  Download, 
  UserPlus, 
  Edit2, 
  Trash2, 
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle,
  Clock,
  X,
  Phone,
  User,
  Dumbbell,
  ShieldCheck
} from 'lucide-react';
import clsx from 'clsx';

export function InscripcionesPage() {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const { canManageInscritos, canExportData } = usePermissions();
  const {
    inscripciones,
    total,
    page,
    pageSize,
    setPage,
    setSearch,
    search,
    filters,
    setFilters,
    isLoading,
    loadInscripciones,
    updateInscripcion,
    deleteInscripcion,
    exportCsv,
  } = useInscripciones(competicionId || 0);

  const [editingInscripcion, setEditingInscripcion] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [competicionTipo, setCompeticionTipo] = useState<string>('grcup');
  const [categoriasMasculino, setCategoriasMasculino] = useState<string[]>([]);
  const [categoriasFemenino, setCategoriasFemenino] = useState<string[]>([]);
  const [competicionSlug, setCompeticionSlug] = useState<string>('');

  const isFER = useMemo(() => competicionTipo === 'fer', [competicionTipo]);

  useEffect(() => {
    if (competicionId) {
      loadInscripciones();
      loadCompeticionTipo();
      loadCategorias();
    }
  }, [competicionId, page, search, filters, loadInscripciones]);

  const loadCompeticionTipo = useCallback(async () => {
    if (!competicionId) return;
    try {
      const result = await api.getAdminCompeticion(competicionId);
      if (result.success && result.data) {
        setCompeticionTipo(result.data.tipo || 'grcup');
        setCompeticionSlug(result.data.slug || '');
      }
    } catch {
      // Default to grcup on error
    }
  }, [competicionId]);

  const loadCategorias = useCallback(async () => {
    if (!competicionSlug) return;
    try {
      const result = await api.getCompeticionConfig(competicionSlug);
      if (result.success && result.data) {
        setCategoriasMasculino(result.data.categoriasMasculino || []);
        setCategoriasFemenino(result.data.categoriasFemenino || []);
      }
    } catch {
      // Silently fail - categories will be empty
    }
  }, [competicionSlug]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInscripciones();
  };

  const handleConfirmPayment = async (id: number) => {
    await updateInscripcion(id, { pagoConfirmado: true, paymentMethod: 'efectivo' });
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta inscripción?')) {
      await deleteInscripcion(id);
    }
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editingInscripcion) return;
    await updateInscripcion(editingInscripcion.id, editingInscripcion);
    setEditingInscripcion(null);
  }, [editingInscripcion, updateInscripcion]);

  const totalPages = Math.ceil(total / pageSize);

  // FER-specific table columns
  const ferTableHeaders = useMemo(() => (
    <>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-nombre">Nombre</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-email">Email</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-telefono">Teléfono</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-instagram">Instagram</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-sexo">Sexo</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-categoria-peso">Cat. Peso</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-experiencia">Experiencia</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-handler">Handler</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-confirmada">Confirmada</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-pago">Pago</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-total">Total</th>
      {canManageInscritos && (
        <th className="px-4 py-3 text-right text-sm font-medium text-gray-300" data-testid="th-acciones">Acciones</th>
      )}
    </>
  ), [canManageInscritos]);

  // GR Cup table columns (unchanged from original)
  const grcupTableHeaders = useMemo(() => (
    <>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-nombre">Nombre</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-email">Email</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-peso">Peso</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-experiencia">Experiencia</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-upsell">Upsell</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-pago">Pago</th>
      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300" data-testid="th-total">Total</th>
      {canManageInscritos && (
        <th className="px-4 py-3 text-right text-sm font-medium text-gray-300" data-testid="th-acciones">Acciones</th>
      )}
    </>
  ), [canManageInscritos]);

  const renderFERow = useCallback((inscripcion: any) => (
    <tr key={inscripcion.id} className="hover:bg-gray-700/30 transition-colors" data-testid={`tr-inscripcion-${inscripcion.id}`}>
      <td className="px-4 py-3" data-testid="td-nombre">
        <p className="text-white font-medium">{inscripcion.nombre}</p>
      </td>
      <td className="px-4 py-3 text-gray-300" data-testid="td-email">{inscripcion.email}</td>
      <td className="px-4 py-3 text-gray-300" data-testid="td-telefono">
        {inscripcion.telefono ? (
          <span className="flex items-center gap-1">
            <Phone size={12} />
            {inscripcion.telefono}
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>
      <td className="px-4 py-3" data-testid="td-instagram">
        {inscripcion.instagram ? (
          <span className="text-gray-300">@{inscripcion.instagram}</span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>
      <td className="px-4 py-3" data-testid="td-sexo">
        <Badge variant={inscripcion.sexo === 'femenino' ? 'purple' : 'gray'}>
          {inscripcion.sexo || 'masculino'}
        </Badge>
      </td>
      <td className="px-4 py-3 text-white font-medium" data-testid="td-categoria-peso">
        {inscripcion.categoriaPeso || '-'}
      </td>
      <td className="px-4 py-3" data-testid="td-experiencia">
        <Badge 
          variant={
            inscripcion.experiencia === 'avanzado' ? 'purple' :
            inscripcion.experiencia === 'intermedio' ? 'blue' : 'gray'
          }
        >
          {inscripcion.experiencia}
        </Badge>
      </td>
      <td className="px-4 py-3" data-testid="td-handler">
        {inscripcion.quiereHandler ? (
          <Badge variant="green">
            <Dumbbell size={12} className="mr-1" />
            Sí
          </Badge>
        ) : (
          <span className="text-gray-500">No</span>
        )}
      </td>
      <td className="px-4 py-3" data-testid="td-confirmada">
        {inscripcion.participacionConfirmada ? (
          <Badge variant="green">
            <ShieldCheck size={12} className="mr-1" />
            Sí
          </Badge>
        ) : (
          <Badge variant="yellow">No</Badge>
        )}
      </td>
      <td className="px-4 py-3" data-testid="td-pago">
        {inscripcion.pagoConfirmado ? (
          <Badge variant="green">
            <CheckCircle size={12} className="mr-1" />
            Pagado
          </Badge>
        ) : (
          <Badge variant="yellow">
            <Clock size={12} className="mr-1" />
            Pendiente
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-white font-medium" data-testid="td-total">
        €{inscripcion.totalPagado?.toFixed(2) || '0.00'}
      </td>
      {canManageInscritos && (
        <td className="px-4 py-3" data-testid="td-acciones">
          <div className="flex items-center justify-end gap-2">
            {!inscripcion.pagoConfirmado && (
              <button
                onClick={() => handleConfirmPayment(inscripcion.id)}
                className="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors"
                title="Confirmar pago"
                data-testid="btn-confirm-pago"
              >
                <CheckCircle size={16} />
              </button>
            )}
            <button
              onClick={() => setEditingInscripcion(inscripcion)}
              className="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
              title="Editar"
              data-testid="btn-edit"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => handleDelete(inscripcion.id)}
              className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
              title="Eliminar"
              data-testid="btn-delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      )}
    </tr>
  ), [canManageInscritos, handleConfirmPayment, handleDelete]);

  const renderGRCupRow = useCallback((inscripcion: any) => (
    <tr key={inscripcion.id} className="hover:bg-gray-700/30 transition-colors" data-testid={`tr-inscripcion-${inscripcion.id}`}>
      <td className="px-4 py-3" data-testid="td-nombre">
        <div>
          <p className="text-white font-medium">{inscripcion.nombre}</p>
          {inscripcion.instagram && (
            <p className="text-sm text-gray-400">@{inscripcion.instagram}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-300" data-testid="td-email">{inscripcion.email}</td>
      <td className="px-4 py-3 text-gray-300" data-testid="td-peso">{inscripcion.pesoAprox} kg</td>
      <td className="px-4 py-3" data-testid="td-experiencia">
        <Badge 
          variant={
            inscripcion.experiencia === 'avanzado' ? 'purple' :
            inscripcion.experiencia === 'intermedio' ? 'blue' : 'gray'
          }
        >
          {inscripcion.experiencia}
        </Badge>
      </td>
      <td className="px-4 py-3" data-testid="td-upsell">
        {inscripcion.upsellPreparacion ? (
          <Badge variant="green">Sí</Badge>
        ) : (
          <span className="text-gray-500">No</span>
        )}
      </td>
      <td className="px-4 py-3" data-testid="td-pago">
        {inscripcion.pagoConfirmado ? (
          <Badge variant="green">
            <CheckCircle size={12} className="mr-1" />
            Pagado
          </Badge>
        ) : (
          <Badge variant="yellow">
            <Clock size={12} className="mr-1" />
            Pendiente
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-white font-medium" data-testid="td-total">
        €{inscripcion.totalPagado.toFixed(2)}
      </td>
      {canManageInscritos && (
        <td className="px-4 py-3" data-testid="td-acciones">
          <div className="flex items-center justify-end gap-2">
            {!inscripcion.pagoConfirmado && (
              <button
                onClick={() => handleConfirmPayment(inscripcion.id)}
                className="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors"
                title="Confirmar pago"
                data-testid="btn-confirm-pago"
              >
                <CheckCircle size={16} />
              </button>
            )}
            <button
              onClick={() => setEditingInscripcion(inscripcion)}
              className="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
              title="Editar"
              data-testid="btn-edit"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => handleDelete(inscripcion.id)}
              className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
              title="Eliminar"
              data-testid="btn-delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      )}
    </tr>
  ), [canManageInscritos, handleConfirmPayment, handleDelete]);

  // FER Edit Modal Fields
  const ferEditFields = useMemo(() => {
    if (!editingInscripcion) return null;
    return (
      <div className="space-y-4" data-testid="fer-edit-fields">
        <div>
          <label className="block text-sm text-gray-400 mb-1" data-testid="label-nombre">Nombre</label>
          <Input
            value={editingInscripcion.nombre}
            onChange={(e) => setEditingInscripcion({ ...editingInscripcion, nombre: e.target.value })}
            data-testid="input-nombre"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1" data-testid="label-email">Email</label>
          <Input
            value={editingInscripcion.email}
            onChange={(e) => setEditingInscripcion({ ...editingInscripcion, email: e.target.value })}
            data-testid="input-email"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-telefono">Teléfono</label>
            <Input
              value={editingInscripcion.telefono || ''}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, telefono: e.target.value })}
              data-testid="input-telefono"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-instagram">Instagram</label>
            <Input
              value={editingInscripcion.instagram || ''}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, instagram: e.target.value })}
              data-testid="input-instagram"
            />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-sexo">Sexo</label>
            <select
              value={editingInscripcion.sexo || 'masculino'}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, sexo: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-full"
              data-testid="select-sexo"
            >
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-categoria-peso">Categoría Peso</label>
            <select
              value={editingInscripcion.categoriaPeso || ''}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, categoriaPeso: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-full"
              data-testid="select-categoria-peso"
            >
              <option value="">Seleccionar...</option>
              {(editingInscripcion.sexo === 'femenino' ? categoriasFemenino : categoriasMasculino).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-experiencia">Experiencia</label>
            <select
              value={editingInscripcion.experiencia}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, experiencia: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-full"
              data-testid="select-experiencia"
            >
              <option value="principiante">Principiante</option>
              <option value="intermedio">Intermedio</option>
              <option value="avanzado">Avanzado</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-total-pagado">Total Pagado (€)</label>
            <Input
              type="number"
              value={editingInscripcion.totalPagado}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, totalPagado: Number(e.target.value) })}
              data-testid="input-total-pagado"
            />
          </div>
        </div>
        <div className="space-y-3 pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium text-sm">Quiere Handler</p>
              <p className="text-xs text-gray-400">Servicio de handler GR Strength</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer" data-testid="toggle-handler-wrapper">
              <input
                type="checkbox"
                checked={editingInscripcion.quiereHandler || false}
                onChange={(e) => setEditingInscripcion({ ...editingInscripcion, quiereHandler: e.target.checked })}
                className="sr-only peer"
                data-testid="toggle-handler"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium text-sm">Participación Confirmada</p>
              <p className="text-xs text-gray-400">Confirmada vía check-in QR</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer" data-testid="toggle-participacion-wrapper">
              <input
                type="checkbox"
                checked={editingInscripcion.participacionConfirmada || false}
                onChange={(e) => setEditingInscripcion({ ...editingInscripcion, participacionConfirmada: e.target.checked })}
                className="sr-only peer"
                data-testid="toggle-participacion"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium text-sm">Pago Confirmado</p>
              <p className="text-xs text-gray-400">El pago ha sido verificado</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer" data-testid="toggle-pago-wrapper">
              <input
                type="checkbox"
                checked={editingInscripcion.pagoConfirmado || false}
                onChange={(e) => setEditingInscripcion({ ...editingInscripcion, pagoConfirmado: e.target.checked })}
                className="sr-only peer"
                data-testid="toggle-pago"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1" data-testid="label-notas">Notas</label>
          <textarea
            value={editingInscripcion.notas || ''}
            onChange={(e) => setEditingInscripcion({ ...editingInscripcion, notas: e.target.value })}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-full min-h-[60px]"
            data-testid="textarea-notas"
          />
        </div>
      </div>
    );
  }, [editingInscripcion]);

  // GR Cup Edit Modal Fields
  const grcupEditFields = useMemo(() => {
    if (!editingInscripcion) return null;
    return (
      <div className="space-y-4" data-testid="grcup-edit-fields">
        <div>
          <label className="block text-sm text-gray-400 mb-1" data-testid="label-nombre">Nombre</label>
          <Input
            value={editingInscripcion.nombre}
            onChange={(e) => setEditingInscripcion({ ...editingInscripcion, nombre: e.target.value })}
            data-testid="input-nombre"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1" data-testid="label-email">Email</label>
          <Input
            value={editingInscripcion.email}
            onChange={(e) => setEditingInscripcion({ ...editingInscripcion, email: e.target.value })}
            data-testid="input-email"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-peso">Peso (kg)</label>
            <Input
              type="number"
              value={editingInscripcion.pesoAprox}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, pesoAprox: Number(e.target.value) })}
              data-testid="input-peso"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1" data-testid="label-total-pagado">Total Pagado (€)</label>
            <Input
              type="number"
              value={editingInscripcion.totalPagado}
              onChange={(e) => setEditingInscripcion({ ...editingInscripcion, totalPagado: Number(e.target.value) })}
              data-testid="input-total-pagado"
            />
          </div>
        </div>
      </div>
    );
  }, [editingInscripcion]);

  return (
    <AdminLayout 
      title="Inscripciones" 
      subtitle={`${total} inscripciones totales${isFER ? ' (FER)' : ''}`}
      actions={
        <div className="flex gap-3">
          {canExportData && (
            <Button variant="secondary" size="sm" onClick={exportCsv} data-testid="btn-export-csv">
              <Download size={16} className="mr-2" />
              Exportar CSV
            </Button>
          )}
          {canManageInscritos && (
            <Button size="sm" data-testid="btn-new-inscripcion">
              <UserPlus size={16} className="mr-2" />
              Nueva Inscripción
            </Button>
          )}
        </div>
      }
    >
      {/* Search and Filters */}
      <Card className="p-4 mb-6" data-testid="card-search">
        <div className="flex flex-col md:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Buscar por nombre, email o Instagram..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
                data-testid="input-search"
              />
            </div>
            <Button type="submit" data-testid="btn-search">
              <Search size={16} className="mr-2" />
              Buscar
            </Button>
          </form>
          
          <Button 
            variant="secondary" 
            onClick={() => setShowFilters(!showFilters)}
            data-testid="btn-filters"
          >
            <Filter size={16} className="mr-2" />
            Filtros
            {(filters.pagoConfirmado !== undefined || filters.experiencia) && (
              <span className="ml-2 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                {(filters.pagoConfirmado !== undefined ? 1 : 0) + (filters.experiencia ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2" data-testid="label-filter-pago">Estado de Pago</label>
              <select
                value={filters.pagoConfirmado === undefined ? '' : String(filters.pagoConfirmado)}
                onChange={(e) => setFilters({
                  ...filters,
                  pagoConfirmado: e.target.value === '' ? undefined : e.target.value === 'true'
                })}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                data-testid="select-filter-pago"
              >
                <option value="">Todos</option>
                <option value="true">Pagados</option>
                <option value="false">Pendientes</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2" data-testid="label-filter-experiencia">Experiencia</label>
              <select
                value={filters.experiencia || ''}
                onChange={(e) => setFilters({
                  ...filters,
                  experiencia: e.target.value || undefined
                })}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                data-testid="select-filter-experiencia"
              >
                <option value="">Todas</option>
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>

            {(filters.pagoConfirmado !== undefined || filters.experiencia) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setFilters({})}
                className="self-end"
                data-testid="btn-clear-filters"
              >
                <X size={16} className="mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden" data-testid="card-table">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : inscripciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Search size={48} className="mb-4 opacity-50" />
            <p>No se encontraron inscripciones</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="table-inscripciones">
              <thead className="bg-gray-700/50">
                <tr>
                  {isFER ? ferTableHeaders : grcupTableHeaders}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {inscripciones.map((inscripcion) => (
                  isFER ? renderFERow(inscripcion) : renderGRCupRow(inscripcion)
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-400">
            Mostrando {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              data-testid="btn-prev-page"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="px-4 py-2 text-white">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              data-testid="btn-next-page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingInscripcion && (
        <Modal
          isOpen={true}
          onClose={() => setEditingInscripcion(null)}
          title={isFER ? 'Editar Inscripción FER' : 'Editar Inscripción'}
        >
          {isFER ? ferEditFields : grcupEditFields}
          <div className="flex gap-4 pt-4 mt-4 border-t border-gray-700">
            <Button
              variant="secondary"
              onClick={() => setEditingInscripcion(null)}
              className="flex-1"
              data-testid="btn-cancel-edit"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="flex-1"
              data-testid="btn-save-edit"
            >
              Guardar
            </Button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
