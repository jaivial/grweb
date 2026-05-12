import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useAtomValue } from 'jotai';
import { currentCompeticionIdAtom } from '../../stores/auth.atoms';
import { useRifa } from '../../hooks/useRifa';
import { usePermissions } from '../../hooks/usePermissions';
import { 
  Ticket, 
  DollarSign,
  Calendar,
  Trophy,
  Plus,
  RotateCcw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export function RifaPage() {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const { canManageRaffle, canSellTickets } = usePermissions();
  const {
    config,
    tickets,
    ticketsTotal,
    isLoading,
    loadConfig,
    updateConfig,
    loadTickets,
    sellTicket,
    realizarSorteo,
  } = useRifa(competicionId || 0);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellForm, setSellForm] = useState({ buyerNombre: '', buyerEmail: '' });
  const [configForm, setConfigForm] = useState({
    nombrePremio: '',
    descripcionPremio: '',
    precioTicket: 5,
    ticketsTotal: 100,
    activo: false,
    fechaSorteo: '',
  });

  useEffect(() => {
    if (competicionId) {
      loadConfig();
      loadTickets();
    }
  }, [competicionId, loadConfig, loadTickets]);

  useEffect(() => {
    if (config) {
      setConfigForm({
        nombrePremio: config.nombrePremio || '',
        descripcionPremio: config.descripcionPremio || '',
        precioTicket: config.precioTicket,
        ticketsTotal: config.ticketsTotal,
        activo: config.activo,
        fechaSorteo: config.fechaSorteo?.split('T')[0] || '',
      });
    }
  }, [config]);

  const handleSaveConfig = async () => {
    await updateConfig(configForm);
    setShowConfigModal(false);
  };

  const handleSellTicket = async () => {
    await sellTicket(sellForm);
    setSellForm({ buyerNombre: '', buyerEmail: '' });
    setShowSellModal(false);
  };

  const handleRealizarSorteo = async () => {
    if (!config?.numeroGanador) {
      const result = await realizarSorteo();
      if (result?.success && result.data) {
        toast.success(`¡Número ganador: ${result.data.numeroGanador}!`);
      }
    }
  };

  const ticketsVendidos = config ? tickets.filter(t => t.confirmado).length : 0;
  const ticketsDisponibles = (config?.ticketsTotal || 100) - ticketsVendidos;

  return (
    <AdminLayout 
      title="Rifa" 
      subtitle="Gestión de la rifa de la competición"
      actions={
        <div className="flex gap-3">
          {canSellTickets && (
            <Button size="sm" onClick={() => setShowSellModal(true)}>
              <Plus size={16} className="mr-2" />
              Vender Ticket
            </Button>
          )}
          {canManageRaffle && (
            <Button variant="secondary" size="sm" onClick={() => setShowConfigModal(true)}>
              Configurar
            </Button>
          )}
        </div>
      }
    >
      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Ticket size={24} className="text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Tickets Vendidos</p>
              <p className="text-2xl font-bold text-white">{ticketsVendidos}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <CheckCircle size={24} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Disponibles</p>
              <p className="text-2xl font-bold text-white">{ticketsDisponibles}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <DollarSign size={24} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Precio Ticket</p>
              <p className="text-2xl font-bold text-white">€{config?.precioTicket || 5}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Trophy size={24} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Premio</p>
              <p className="text-lg font-bold text-white truncate">
                {config?.nombrePremio || 'No configurado'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Winner Section */}
      {config?.numeroGanador ? (
        <Card className="p-6 mb-6 border-green-500/50 bg-green-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-green-500/20 rounded-full">
                <Trophy size={32} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm text-green-400 font-medium">¡Ganador!</p>
                <p className="text-3xl font-bold text-white">
                  Ticket #{config.numeroGanador}
                </p>
              </div>
            </div>
            {config.ganadorConfirmado ? (
              <Badge variant="green" className="text-lg px-4 py-2">
                Confirmado
              </Badge>
            ) : (
              <Button variant="secondary">
                <CheckCircle size={16} className="mr-2" />
                Confirmar Premio
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gray-500/20 rounded-full">
                <AlertCircle size={32} className="text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Sorteo pendiente</p>
                <p className="text-lg font-medium text-white">
                  {ticketsVendidos > 0 
                    ? `${ticketsVendidos} tickets en juego`
                    : 'No hay tickets vendidos aún'
                  }
                </p>
              </div>
            </div>
            {canManageRaffle && ticketsVendidos > 0 && (
              <Button onClick={handleRealizarSorteo}>
                <RotateCcw size={16} className="mr-2" />
                Realizar Sorteo
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Tickets List */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Tickets Vendidos</h3>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Spinner size="lg" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Ticket size={48} className="mx-auto mb-4 opacity-50" />
            <p>No hay tickets vendidos todavía</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300"># Ticket</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Comprador</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">#{ticket.numeroTicket}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {ticket.buyerNombre || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {ticket.buyerEmail || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(ticket.createdAt).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-4 py-3">
                      {ticket.confirmado ? (
                        <Badge variant="green">Confirmado</Badge>
                      ) : (
                        <Badge variant="yellow">Pendiente</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Config Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Configurar Rifa"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nombre del Premio</label>
            <Input
              value={configForm.nombrePremio}
              onChange={(e) => setConfigForm({ ...configForm, nombrePremio: e.target.value })}
              placeholder="ej. Camiseta oficial GR Cup"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Descripción</label>
            <textarea
              value={configForm.descripcionPremio}
              onChange={(e) => setConfigForm({ ...configForm, descripcionPremio: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              rows={3}
              placeholder="Descripción del premio..."
            />
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Precio (€)</label>
              <Input
                type="number"
                value={configForm.precioTicket}
                onChange={(e) => setConfigForm({ ...configForm, precioTicket: Number(e.target.value) })}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Total Tickets</label>
              <Input
                type="number"
                value={configForm.ticketsTotal}
                onChange={(e) => setConfigForm({ ...configForm, ticketsTotal: Number(e.target.value) })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha del Sorteo</label>
            <Input
              type="date"
              value={configForm.fechaSorteo}
              onChange={(e) => setConfigForm({ ...configForm, fechaSorteo: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activo"
              checked={configForm.activo}
              onChange={(e) => setConfigForm({ ...configForm, activo: e.target.checked })}
              className="rounded bg-gray-700 border-gray-600"
            />
            <label htmlFor="activo" className="text-sm text-white">
              Rifa activa (允许 vender tickets)
            </label>
          </div>
          
          <div className="flex gap-4 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowConfigModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig} className="flex-1">
              Guardar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Sell Ticket Modal */}
      <Modal
        isOpen={showSellModal}
        onClose={() => setShowSellModal(false)}
        title="Vender Ticket"
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Precio:</span>
              <span className="text-white font-medium">€{config?.precioTicket || 5}</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-gray-400">Disponibles:</span>
              <span className="text-white font-medium">{ticketsDisponibles}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nombre del comprador</label>
            <Input
              value={sellForm.buyerNombre}
              onChange={(e) => setSellForm({ ...sellForm, buyerNombre: e.target.value })}
              placeholder="Nombre completo"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email del comprador</label>
            <Input
              type="email"
              value={sellForm.buyerEmail}
              onChange={(e) => setSellForm({ ...sellForm, buyerEmail: e.target.value })}
              placeholder="email@ejemplo.com"
            />
          </div>
          
          <div className="flex gap-4 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowSellModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button onClick={handleSellTicket} className="flex-1">
              <Ticket size={16} className="mr-2" />
              Vender Ticket
            </Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
