import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';

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

export function Sorteo(): JSX.Element {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [currentWinner, setCurrentWinner] = useState<Draw | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [drawInProgress, setDrawInProgress] = useState(false);

  useEffect(() => {
    fetchDraws();
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
    } catch {
      setError('Error al realizar el sorteo');
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

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="sorteo-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6" data-ui="page-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1">Sorteo</h1>
          <p className="text-sm xs:text-base text-gray-400">Selecciona aleatoriamente al ganador del premio</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 xs:p-4 mb-4 xs:mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Draw Section */}
        <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl p-4 xs:p-6 sm:p-8 mb-6 xs:mb-8">
          <div className="text-center">
            <div className="mb-4 xs:mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 xs:w-20 xs:h-20 rounded-full bg-gradient-to-br from-red-accent to-dark-red mb-3 xs:mb-4">
                <svg className="w-8 h-8 xs:w-10 xs:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg xs:text-xl sm2:text-2xl font-bold text-white mb-1.5 xs:mb-2">Listo para sortear?</h2>
              <p className="text-gray-400 max-w-md mx-auto text-sm xs:text-base">
                Haz clic en el boton para seleccionar aleatoriamente al ganador. La seleccion es ponderada por tickets.
              </p>
            </div>

            <button
              onClick={handleDraw}
              disabled={drawInProgress}
              className="inline-flex items-center justify-center gap-2 xs:gap-3 px-6 xs:px-8 py-3 xs:py-4 sm:py-5 bg-gradient-to-r from-red-accent to-dark-red text-white text-base xs:text-lg font-bold rounded-xl xs:rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px] sm:min-h-[60px]"
            >
              {drawInProgress ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sorteando...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Seleccionar Ganador
                </>
              )}
            </button>

            <p className="text-gray-500 text-xs xs:text-sm mt-3 xs:mt-4">
              El ganador se selecciona de todos los participantes con al menos 1 ticket
            </p>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && currentWinner && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 xs:p-4">
            <div className="bg-dark-surface border border-white/10 rounded-2xl p-4 xs:p-6 sm:p-8 max-w-md w-full">
              <div className="text-center mb-4 xs:mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 xs:w-20 xs:h-20 rounded-full bg-gradient-to-br from-dark-red to-red-accent mb-3 xs:mb-4">
                  <svg className="w-8 h-8 xs:w-10 xs:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <h3 className="text-xl xs:text-2xl font-bold text-white mb-2">Ganador Seleccionado!</h3>
              </div>

              <div className="bg-black/20 rounded-xl p-4 xs:p-6 mb-4 xs:mb-6 text-center">
                <p className="text-2xl xs:text-3xl font-bold text-white mb-1.5 xs:mb-2">{currentWinner.winnerName}</p>
                <p className="text-red-accent text-base xs:text-lg mb-2 xs:mb-3">@{currentWinner.winnerInstagram?.replace('@', '')}</p>
                <div className="flex items-center justify-center gap-4 xs:gap-6 text-sm">
                  <div>
                    <p className="text-gray-500">Tickets</p>
                    <p className="text-white font-bold text-lg xs:text-xl">{currentWinner.winnerTicketCount}</p>
                  </div>
                  <div className="w-px h-8 bg-white/10 hidden xs:block" />
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="text-gray-300 text-xs xs:text-sm">{currentWinner.winnerEmail}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 xs:gap-3">
                <button
                  onClick={() => handleConfirm(currentWinner.id)}
                  className="flex-1 px-4 xs:px-6 py-2.5 xs:py-3 bg-green-500/10 border border-green-500/30 text-green-400 font-bold rounded-lg hover:bg-green-500/20 transition-colors min-h-[44px] text-sm xs:text-base"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => handleVoid(currentWinner.id)}
                  className="flex-1 px-4 xs:px-6 py-2.5 xs:py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-bold rounded-lg hover:bg-red-500/20 transition-colors min-h-[44px] text-sm xs:text-base"
                >
                  Anular y re-sorteo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Draw History */}
        <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-4 xs:p-6 border-b border-white/5">
            <h2 className="text-lg xs:text-xl font-bold text-white">Historial de Sorteos</h2>
            <p className="text-gray-500 text-xs xs:text-sm mt-1">Todos los sorteos anteriores y su estado</p>
          </div>

          {loading && draws.length === 0 ? (
            <div className="p-8 xs:p-12 text-center text-gray-500">Cargando...</div>
          ) : draws.length === 0 ? (
            <div className="p-8 xs:p-12 text-center text-gray-500 text-sm xs:text-base">
              No hay sorteos todavia. ¡Haz clic en el boton de arriba para sortear!
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {draws.map((draw) => (
                <div key={draw.id} className="p-4 xs:p-6 hover:bg-white/[0.02] transition-colors">
                  <div className="flex flex-col xs:flex-row xs:items-start justify-between gap-3 xs:gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 xs:gap-3 mb-1.5 xs:mb-2">
                        <div className={`w-2.5 h-2.5 xs:w-3 xs:h-3 rounded-full ${draw.isConfirmed ? 'bg-green-400' : 'bg-yellow-400'}`} />
                        <span className={`px-2 xs:px-3 py-0.5 xs:py-1 rounded-full text-xs font-bold ${
                          draw.isConfirmed
                            ? 'bg-green-400/10 text-green-400'
                            : 'bg-yellow-400/10 text-yellow-400'
                        }`}>
                          {draw.isConfirmed ? 'Confirmado' : 'Pendiente'}
                        </span>
                      </div>
                      <div className="text-white font-semibold text-base xs:text-lg mb-1">{draw.winnerName}</div>
                      <div className="flex flex-wrap items-center gap-1.5 xs:gap-3 text-xs xs:text-sm">
                        <span className="text-red-accent">@{draw.winnerInstagram?.replace('@', '')}</span>
                        <span className="text-gray-600 hidden xs:inline">·</span>
                        <span className="text-gray-400">{draw.winnerEmail}</span>
                        <span className="text-gray-600 hidden xs:inline">·</span>
                        <span className="text-dark-red font-bold">{draw.winnerTicketCount} tickets</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 xs:gap-3">
                      <div className="text-right text-xs xs:text-sm text-gray-500">{formatDate(draw.drawDate)}</div>
                      {!draw.isConfirmed && (
                        <button
                          onClick={() => handleVoid(draw.id)}
                          className="px-3 xs:px-4 py-1.5 xs:py-2 min-h-[36px] xs:min-h-[40px] bg-white/5 hover:bg-white/[0.08] text-gray-300 rounded-lg transition-colors text-xs xs:text-sm font-medium border border-white/10"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="mt-4 xs:mt-6 grid grid-cols-1 xs:grid-cols-1 sm2:grid-cols-2 md:grid-cols-3 gap-3 xs:gap-4">
          <div className="p-4 xs:p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl">
            <div className="flex items-center gap-2.5 xs:gap-3 mb-2 xs:mb-3">
              <div className="w-8 h-8 xs:w-9 xs:h-9 rounded-lg bg-white/5 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xs xs:text-sm font-bold text-white">Seleccion Ponderada</h3>
            </div>
            <p className="text-gray-400 text-xs xs:text-sm">
              Los ganadores se seleccionan aleatoriamente con probabilidad ponderada por tickets. Mas tickets = mayor probabilidad.
            </p>
          </div>
          <div className="p-4 xs:p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl">
            <div className="flex items-center gap-2.5 xs:gap-3 mb-2 xs:mb-3">
              <div className="w-8 h-8 xs:w-9 xs:h-9 rounded-lg bg-white/5 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xs xs:text-sm font-bold text-white">Registro Completo</h3>
            </div>
            <p className="text-gray-400 text-xs xs:text-sm">
              Todos los sorteos quedan registrados con timestamps. Se pueden anular si es necesario.
            </p>
          </div>
          <div className="p-4 xs:p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl sm2:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 xs:gap-3 mb-2 xs:mb-3">
              <div className="w-8 h-8 xs:w-9 xs:h-9 rounded-lg bg-white/5 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xs xs:text-sm font-bold text-white">Confirmacion</h3>
            </div>
            <p className="text-gray-400 text-xs xs:text-sm">
              Los ganadores deben confirmarse antes de finalizarse. Se puede volver a sortear si es necesario.
            </p>
          </div>
        </div>
      </div>
    </BackofficeLayout>
  );
}

export default Sorteo;
