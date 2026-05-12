import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { useAtomValue, useSetAtom } from 'jotai';
import { currentCompeticionIdAtom, currentCompeticionAtom } from '../../stores/auth.atoms';
import { useCompeticiones } from '../../hooks/useCompeticion';
import { usePermissions } from '../../hooks/usePermissions';
import api from '../../api/client';
import { 
  Settings,
  Users,
  Euro,
  Calendar,
  MapPin,
  Image,
  Save,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export function ConfigPage() {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const { canManageConfig } = usePermissions();
  const { loadCompeticionData, currentCompeticionData } = useCompeticiones();
  const setCurrentCompeticionData = useSetAtom(currentCompeticionAtom as any);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    fecha: '',
    lugar: '',
    logoUrl: '',
    faviconUrl: '',
  });
  const [eventoConfig, setEventoConfig] = useState({
    aforMaximo: 100,
    precioBase: 35,
    precioUpsell: 60,
    precioRifa: 5,
    precioHandler: 0,
    maxTicketsPorPersona: 10,
    inscripcionAbierta: true,
  });
  const [activeTab, setActiveTab] = useState<'general' | 'evento'>('general');

  useEffect(() => {
    if (competicionId) {
      loadData();
    }
  }, [competicionId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await api.getAdminCompeticion(competicionId!);
      if (result.success && result.data) {
        setForm({
          nombre: result.data.nombre,
          fecha: result.data.fecha?.split('T')[0] || '',
          lugar: result.data.lugar,
          logoUrl: result.data.logoUrl || '',
          faviconUrl: result.data.faviconUrl || '',
        });
        
        if (result.data.eventoConfig) {
          setEventoConfig(result.data.eventoConfig);
        }
      }
    } catch (error) {
      toast.error('Error al cargar configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGeneral = async () => {
    setIsSaving(true);
    try {
      const result = await api.updateCompeticion(competicionId!, {
        nombre: form.nombre,
        fecha: form.fecha,
        lugar: form.lugar,
        logoUrl: form.logoUrl || undefined,
        faviconUrl: form.faviconUrl || undefined,
      });
      
      if (result.success) {
        toast.success('Configuración guardada');
        await loadData();
      } else {
        toast.error(result.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEvento = async () => {
    setIsSaving(true);
    try {
      const result = await api.updateEventoConfig(competicionId!, eventoConfig);
      
      if (result.success) {
        toast.success('Configuración de evento guardada');
        await loadData();
      } else {
        toast.error(result.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Configuración">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Configuración" 
      subtitle="Configuración de la competición"
    >
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-3 px-2 font-medium transition-colors ${
            activeTab === 'general'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Settings size={16} className="inline mr-2" />
          General
        </button>
        <button
          onClick={() => setActiveTab('evento')}
          className={`pb-3 px-2 font-medium transition-colors ${
            activeTab === 'evento'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Calendar size={16} className="inline mr-2" />
          Evento
        </button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Información General</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Settings size={14} className="inline mr-1" />
                  Nombre de la Competición
                </label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  disabled={!canManageConfig}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Calendar size={14} className="inline mr-1" />
                  Fecha
                </label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  disabled={!canManageConfig}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <MapPin size={14} className="inline mr-1" />
                  Lugar
                </label>
                <Input
                  value={form.lugar}
                  onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                  disabled={!canManageConfig}
                />
              </div>
            </div>

            {canManageConfig && (
              <Button 
                onClick={handleSaveGeneral} 
                className="w-full mt-6"
                disabled={isSaving}
              >
                {isSaving ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Imágenes</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Image size={14} className="inline mr-1" />
                  URL del Logo
                </label>
                <Input
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  placeholder="https://..."
                  disabled={!canManageConfig}
                />
                {form.logoUrl && (
                  <div className="mt-2 p-2 bg-gray-700/50 rounded-lg">
                    <img 
                      src={form.logoUrl} 
                      alt="Logo preview" 
                      className="h-12 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Image size={14} className="inline mr-1" />
                  URL del Favicon
                </label>
                <Input
                  value={form.faviconUrl}
                  onChange={(e) => setForm({ ...form, faviconUrl: e.target.value })}
                  placeholder="https://..."
                  disabled={!canManageConfig}
                />
                {form.faviconUrl && (
                  <div className="mt-2 p-2 bg-gray-700/50 rounded-lg flex items-center">
                    <img 
                      src={form.faviconUrl} 
                      alt="Favicon preview" 
                      className="h-8 w-8 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Evento Tab */}
      {activeTab === 'evento' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Precios</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Euro size={14} className="inline mr-1" />
                  Precio Base (€)
                </label>
                <Input
                  type="number"
                  value={eventoConfig.precioBase}
                  onChange={(e) => setEventoConfig({ 
                    ...eventoConfig, 
                    precioBase: Number(e.target.value) 
                  })}
                  disabled={!canManageConfig}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Euro size={14} className="inline mr-1" />
                  Precio Upsell Preparación (€)
                </label>
                <Input
                  type="number"
                  value={eventoConfig.precioUpsell}
                  onChange={(e) => setEventoConfig({ 
                    ...eventoConfig, 
                    precioUpsell: Number(e.target.value) 
                  })}
                  disabled={!canManageConfig}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Precio adicional por ayuda de preparación
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Euro size={14} className="inline mr-1" />
                  Precio Ticket Rifa (€)
                </label>
                <Input
                  type="number"
                  value={eventoConfig.precioRifa}
                  onChange={(e) => setEventoConfig({ 
                    ...eventoConfig, 
                    precioRifa: Number(e.target.value) 
                  })}
                  disabled={!canManageConfig}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Euro size={14} className="inline mr-1" />
                  Precio Handler (EUR)
                </label>
                <Input
                  type="number"
                  value={eventoConfig.precioHandler}
                  onChange={(e) => setEventoConfig({ 
                    ...eventoConfig, 
                    precioHandler: Number(e.target.value) 
                  })}
                  disabled={!canManageConfig}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Precio del servicio de handler GR Strength
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Capacidad</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Users size={14} className="inline mr-1" />
                  Aforo Máximo
                </label>
                <Input
                  type="number"
                  value={eventoConfig.aforMaximo}
                  onChange={(e) => setEventoConfig({ 
                    ...eventoConfig, 
                    aforMaximo: Number(e.target.value) 
                  })}
                  disabled={!canManageConfig}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  <Users size={14} className="inline mr-1" />
                  Máx. Tickets por Persona
                </label>
                <Input
                  type="number"
                  value={eventoConfig.maxTicketsPorPersona}
                  onChange={(e) => setEventoConfig({ 
                    ...eventoConfig, 
                    maxTicketsPorPersona: Number(e.target.value) 
                  })}
                  disabled={!canManageConfig}
                />
              </div>

              <div className="pt-4 border-t border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">Inscripción Abierta</p>
                    <p className="text-xs text-gray-400">
                      Permitir nuevas inscripciones
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventoConfig.inscripcionAbierta}
                      onChange={(e) => setEventoConfig({ 
                        ...eventoConfig, 
                        inscripcionAbierta: e.target.checked 
                      })}
                      disabled={!canManageConfig}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>
                
                {eventoConfig.inscripcionAbierta ? (
                  <Badge variant="green" className="mt-2">
                    <CheckCircle size={12} className="mr-1" />
                    Abierta
                  </Badge>
                ) : (
                  <Badge variant="red" className="mt-2">
                    <AlertCircle size={12} className="mr-1" />
                    Cerrada
                  </Badge>
                )}
              </div>
            </div>

            {canManageConfig && (
              <Button 
                onClick={handleSaveEvento} 
                className="w-full mt-6"
                disabled={isSaving}
              >
                {isSaving ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    Guardar Configuración
                  </>
                )}
              </Button>
            )}
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
