import { useEffect, useState } from 'react';
import { api } from '../../utils/api';

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

export default function DrawWinner() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draws');
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

      // Refresh draw history
      await fetchDraws();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draw winner');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm winner');
    }
  }

  async function handleVoid(drawId: number) {
    if (!confirm('Are you sure you want to void this draw? This action cannot be undone.')) {
      return;
    }

    try {
      await api.voidDraw(drawId);
      setShowConfirmModal(false);
      setCurrentWinner(null);
      await fetchDraws();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void draw');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return (
    <div className="min-h-screen bg-dark-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-2">Draw Winner</h1>
          <p className="text-text-secondary">Randomly select the raffle winner</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6 animate-fade-in">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div>
                <p className="text-red-500 font-semibold">Error</p>
                <p className="text-red-400 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Draw Section */}
        <div className="bg-dark-surface rounded-2xl p-8 border border-dark-lighter mb-8 animate-slide-up">
          <div className="text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-red-accent to-dark-red mb-4">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Ready to Draw?</h2>
              <p className="text-gray-400 max-w-md mx-auto">
                Click the button below to randomly select a winner. The selection is weighted by ticket count.
              </p>
            </div>

            <button
              onClick={handleDraw}
              disabled={drawInProgress}
              className="px-12 py-6 bg-gradient-to-r from-red-accent to-dark-red text-white text-xl font-bold rounded-2xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-red-accent flex items-center justify-center gap-3 mx-auto"
            >
              {drawInProgress ? (
                <>
                  <div className="w-6 h-6 border-3 border-dark-base border-t-transparent rounded-full animate-spin"></div>
                  Drawing...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                  Randomly Select Winner
                </>
              )}
            </button>

            <p className="text-text-muted text-sm mt-4">
              Winner will be selected from all participants with ≥1 ticket
            </p>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && currentWinner && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-dark-surface rounded-2xl p-8 max-w-md w-full border-2 border-dark-red animate-slide-up">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-dark-red to-red-accent mb-4 animate-pulse-slow">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Winner Selected!</h3>
              </div>

              <div className="bg-dark-base rounded-xl p-6 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-dark-red mb-2">
                    {currentWinner.winnerName}
                  </p>
                  <p className="text-red-accent text-lg mb-3">
                    @{currentWinner.winnerInstagram?.replace('@', '')}
                  </p>
                  <div className="flex items-center justify-center gap-4 text-sm">
                    <div>
                      <p className="text-text-muted">Tickets</p>
                      <p className="text-text-primary font-bold text-xl">{currentWinner.winnerTicketCount}</p>
                    </div>
                    <div className="w-px h-8 bg-dark-lighter"></div>
                    <div>
                      <p className="text-text-muted">Email</p>
                      <p className="text-text-secondary text-sm">{currentWinner.winnerEmail}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleConfirm(currentWinner.id)}
                  className="flex-1 px-6 py-3 bg-green-500 text-dark-base font-bold rounded-lg hover:scale-105 transition-transform"
                >
                  Confirm Winner
                </button>
                <button
                  onClick={() => handleVoid(currentWinner.id)}
                  className="flex-1 px-6 py-3 bg-red-500 text-white font-bold rounded-lg hover:scale-105 transition-transform"
                >
                  Void &amp; Re-draw
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Draw History */}
        <div className="bg-dark-surface rounded-2xl border border-dark-lighter overflow-hidden animate-fade-in">
          <div className="p-6 border-b border-dark-lighter">
            <h2 className="text-2xl font-bold text-text-primary">Draw History</h2>
            <p className="text-text-secondary text-sm mt-1">All previous draws and their status</p>
          </div>

          {loading && draws.length === 0 ? (
            <div className="p-12 text-center text-text-muted">Loading...</div>
          ) : draws.length === 0 ? (
            <div className="p-12 text-center text-text-muted">
              No draws yet. Click the button above to draw the first winner!
            </div>
          ) : (
            <div className="divide-y divide-dark-lighter">
              {draws.map((draw, index) => (
                <div 
                  key={draw.id} 
                  className="p-6 hover:bg-dark-base/50 transition-colors animate-slide-up"
                  style={`animation-delay: ${index * 0.05}s`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${draw.isConfirmed ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          draw.isConfirmed 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-yellow-500/10 text-yellow-500'
                        }`}>
                          {draw.isConfirmed ? 'Confirmed' : 'Pending'}
                        </span>
                      </div>
                      <div className="text-text-primary font-semibold text-lg mb-1">
                        {draw.winnerName}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-red-accent">@{draw.winnerInstagram?.replace('@', '')}</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-400">{draw.winnerEmail}</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-dark-red font-bold">{draw.winnerTicketCount} tickets</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm text-text-muted">
                        {formatDate(draw.drawDate)}
                      </div>
                      {!draw.isConfirmed && (
                        <button
                          onClick={() => handleVoid(draw.id)}
                          className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-semibold"
                        >
                          Void
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
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          <div className="bg-dark-surface rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-accent/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">Weighted Selection</h3>
            </div>
            <p className="text-gray-400 text-sm">
              Winners are selected randomly with probability weighted by ticket count. More tickets = higher chance.
            </p>
          </div>

          <div className="bg-dark-surface rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-dark-red/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-dark-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">Audit Trail</h3>
            </div>
            <p className="text-gray-400 text-sm">
              All draws are logged with timestamps and can be voided if needed. Complete transparency.
            </p>
          </div>

          <div className="bg-dark-surface rounded-xl p-6 border border-dark-lighter">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-text-primary">Confirmation</h3>
            </div>
            <p className="text-text-secondary text-sm">
              Winners must be confirmed before being finalized. You can re-draw if needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
