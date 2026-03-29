/**
 * Draw Page
 * 
 * Admin page for drawing and managing raffle winners.
 */

import type { JSX } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@components/ui';
import { WinnerCard, DrawHistory, DrawInfoCard } from './components';
import { useDraw } from './hooks';
import { ArrowLeftIcon, TrophyIcon, ScaleIcon, ClockIcon, ShieldIcon } from '@components/ui/Icon';

export function DrawPage(): JSX.Element {
  const {
    currentDraw,
    drawHistory,
    isDrawing,
    isLoading,
    isConfirming,
    error,
    drawWinner,
    handleConfirmWinner,
    handleVoidDraw,
  } = useDraw();
  const [location, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-dark-base">
      {/* Header */}
      <header className="bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/dashboard')}
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Draw Winner</h1>
              <p className="text-gray-500 text-sm mt-1">
                Randomly select a winner from all participants
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {/* Draw Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Winner Card / Draw Button */}
          <div className="lg:col-span-2">
            {currentDraw ? (
              <WinnerCard
                draw={currentDraw}
                onConfirm={handleConfirmWinner}
                onReDraw={drawWinner}
                isConfirming={isConfirming}
              />
            ) : (
              <div className="bg-dark-surface rounded-2xl p-12 border border-dark-border text-center">
                <div className="mb-6">
                  <TrophyIcon className="w-16 h-16 text-gray-600 mx-auto" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Ready to Draw?
                </h2>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">
                  Click the button below to randomly select a winner from all participants.
                  The winner will be weighted by their ticket count.
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={drawWinner}
                  disabled={isDrawing || isLoading}
                >
                  {isDrawing ? 'Drawing...' : 'Randomly Select Winner'}
                </Button>
              </div>
            )}
          </div>

          {/* Info Cards */}
          <div className="space-y-4">
            <DrawInfoCard
              title="Weighted Selection"
              icon={<ScaleIcon className="w-5 h-5" />}
            >
              <p>Winners are selected randomly but weighted by ticket count.</p>
              <p className="mt-2">More tickets = higher chance of winning.</p>
            </DrawInfoCard>

            <DrawInfoCard
              title="Audit Trail"
              icon={<ClockIcon className="w-5 h-5" />}
            >
              <p>All draws are logged with timestamp and winner details.</p>
              <p className="mt-2">Draws can be voided before confirmation.</p>
            </DrawInfoCard>

            <DrawInfoCard
              title="Confirmation Required"
              icon={<ShieldIcon className="w-5 h-5" />}
            >
              <p>Winners must be confirmed to be considered official.</p>
              <p className="mt-2">Re-draw if needed before confirmation.</p>
            </DrawInfoCard>
          </div>
        </div>

        {/* Draw History */}
        <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
          <div className="p-4 border-b border-dark-border">
            <h3 className="text-lg font-semibold text-white">Draw History</h3>
          </div>
          <DrawHistory
            draws={drawHistory}
            onVoidDraw={handleVoidDraw}
          />
        </div>
      </main>
    </div>
  );
}

export default DrawPage;
