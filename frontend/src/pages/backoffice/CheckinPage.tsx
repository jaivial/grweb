import { useEffect, useState, useRef } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useAtomValue } from 'jotai';
import { currentCompeticionIdAtom } from '../../stores/auth.atoms';
import { usePermissions } from '../../hooks/usePermissions';
import api from '../../api/client';
import type { Inscripcion } from '../../types/api';
import { 
  Search, 
  QrCode,
  CheckCircle,
  Clock,
  User,
  Camera,
  X,
  AlertCircle,
  Check
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export function CheckinPage() {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const { canDoCheckin } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Inscripcion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedInscripcion, setSelectedInscripcion] = useState<Inscripcion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [checkinsCount, setCheckinsCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanError, setScanError] = useState('');

  // Simulated QR scanning (in production, use a library like html5-qrcode)
  useEffect(() => {
    if (cameraOpen && videoRef.current) {
      // Start camera
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          setScanError('No se pudo acceder a la cámara');
          setCameraOpen(false);
        });
    }

    return () => {
      // Stop camera
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [cameraOpen]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Use slug from URL or default
      const result = await api.searchCheckin('fer', searchQuery);
      if (result.success && result.data) {
        setSearchResults(result.data);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      toast.error('Error en la búsqueda');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectInscripcion = async (inscripcion: Inscripcion) => {
    setSelectedInscripcion(inscripcion);
  };

  const handleConfirmPayment = async () => {
    if (!selectedInscripcion) return;
    
    setIsLoading(true);
    try {
      const result = await api.confirmarPago('fer', selectedInscripcion.id, 'efectivo');
      if (result.success && result.data) {
        setSelectedInscripcion({ ...selectedInscripcion, pagoConfirmado: true });
        toast.success('Pago confirmado');
      } else {
        toast.error(result.message || 'Error al confirmar');
      }
    } catch (error) {
      toast.error('Error al confirmar pago');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckin = async () => {
    if (!selectedInscripcion) return;
    
    if (!selectedInscripcion.pagoConfirmado) {
      toast.error('Primero confirma el pago');
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.marcarAsistio('fer', selectedInscripcion.id);
      if (result.success) {
        setSelectedInscripcion({ 
          ...selectedInscripcion, 
          checkinAt: new Date().toISOString() 
        });
        setCheckinsCount(prev => prev + 1);
        toast.success('¡Check-in completado!');
      } else {
        toast.error(result.message || 'Error en check-in');
      }
    } catch (error) {
      toast.error('Error en check-in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminLayout 
      title="Check-in" 
      subtitle="Control de asistencia el día del evento"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-green-500/20 rounded-full">
              <CheckCircle size={28} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Check-ins Completados</p>
              <p className="text-3xl font-bold text-white">{checkinsCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-blue-500/20 rounded-full">
              <User size={28} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Inscripciones Totales</p>
              <p className="text-3xl font-bold text-white">
                {searchResults.length || '...'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-purple-500/20 rounded-full">
                <QrCode size={28} className="text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Escanear QR</p>
                <p className="text-sm text-gray-500">Con cámara</p>
              </div>
            </div>
            <Button 
              variant="secondary"
              onClick={() => setCameraOpen(true)}
            >
              <Camera size={16} className="mr-2" />
              Abrir
            </Button>
          </div>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Button type="submit" disabled={isSearching}>
            {isSearching ? (
              <Spinner size="sm" />
            ) : (
              <>
                <Search size={16} className="mr-2" />
                Buscar
              </>
            )}
          </Button>
        </form>

        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {searchResults.map((inscripcion) => (
              <div
                key={inscripcion.id}
                onClick={() => handleSelectInscripcion(inscripcion)}
                className={clsx(
                  'p-4 rounded-lg cursor-pointer transition-colors',
                  selectedInscripcion?.id === inscripcion.id
                    ? 'bg-blue-500/20 border border-blue-500'
                    : 'bg-gray-700/50 hover:bg-gray-700'
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{inscripcion.nombre}</p>
                    <p className="text-sm text-gray-400">{inscripcion.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {inscripcion.checkinAt ? (
                      <Badge variant="green">
                        <CheckCircle size={12} className="mr-1" />
                        Check-in
                      </Badge>
                    ) : inscripcion.pagoConfirmado ? (
                      <Badge variant="blue">
                        <Clock size={12} className="mr-1" />
                        Pagado
                      </Badge>
                    ) : (
                      <Badge variant="yellow">
                        <AlertCircle size={12} className="mr-1" />
                        Pendiente
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Selected Inscripcion */}
      {selectedInscripcion && (
        <Card className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">{selectedInscripcion.nombre}</h3>
              <p className="text-gray-400">{selectedInscripcion.email}</p>
              {selectedInscripcion.instagram && (
                <p className="text-sm text-gray-500">@{selectedInscripcion.instagram}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedInscripcion(null)}
              className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-400">Peso</p>
              <p className="text-lg font-medium text-white">{selectedInscripcion.pesoAprox} kg</p>
            </div>
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-400">Experiencia</p>
              <p className="text-lg font-medium text-white capitalize">{selectedInscripcion.experiencia}</p>
            </div>
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-400">Total Pagado</p>
              <p className="text-lg font-medium text-white">€{selectedInscripcion.totalPagado.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-400">Upsell</p>
              <p className="text-lg font-medium text-white">
                {selectedInscripcion.upsellPreparacion ? 'Sí' : 'No'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {!selectedInscripcion.pagoConfirmado && (
              <Button
                variant="secondary"
                onClick={handleConfirmPayment}
                disabled={isLoading}
                className="flex-1"
              >
                <CheckCircle size={16} className="mr-2" />
                Confirmar Pago
              </Button>
            )}
            
            <Button
              onClick={handleCheckin}
              disabled={isLoading || !selectedInscripcion.pagoConfirmado || !!selectedInscripcion.checkinAt}
              className={clsx(
                'flex-1',
                selectedInscripcion.checkinAt && 'bg-green-500 hover:bg-green-600'
              )}
            >
              {isLoading ? (
                <Spinner size="sm" />
              ) : selectedInscripcion.checkinAt ? (
                <>
                  <CheckCircle size={16} className="mr-2" />
                  Check-in Completado
                </>
              ) : (
                <>
                  <Check size={16} className="mr-2" />
                  Completar Check-in
                </>
              )}
            </Button>
          </div>

          {selectedInscripcion.checkinAt && (
            <div className="mt-4 p-4 bg-green-500/20 rounded-lg border border-green-500/50">
              <p className="text-green-400 font-medium">
                <CheckCircle size={16} className="inline mr-2" />
                Check-in completado el {new Date(selectedInscripcion.checkinAt).toLocaleString('es-ES')}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* QR Scanner Modal */}
      <Modal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title="Escanear QR"
      >
        <div className="space-y-4">
          <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white rounded-lg" />
            </div>
          </div>
          
          {scanError && (
            <div className="p-3 bg-red-500/20 rounded-lg text-red-400 text-sm">
              {scanError}
            </div>
          )}
          
          <p className="text-sm text-gray-400 text-center">
            Apunta la cámara al código QR del participante
          </p>
          
          <Button
            variant="secondary"
            onClick={() => setCameraOpen(false)}
            className="w-full"
          >
            Cerrar
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
