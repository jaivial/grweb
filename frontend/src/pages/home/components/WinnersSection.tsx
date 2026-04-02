import type { JSX } from 'react';
import { useEffect } from 'react';
import { useSignal } from '@preact/signals-react';
import { Icon } from '@components/ui/Icon';
import { Button } from '@components/ui/Button';
import { Badge } from '@components/ui/Badge';
import { latestConfirmedWinner, fetchConfirmedWinner } from '../../../stores/participants';
import type { ConfirmedWinner } from '../../../stores/participants';

export function WinnersSection(): JSX.Element {
  const winner = useSignal<ConfirmedWinner | null>(latestConfirmedWinner.value);
  const isLoading = useSignal(true);

  useEffect(() => {
    fetchConfirmedWinner().finally(() => {
      isLoading.value = false;
    });
  }, []);

  useEffect(() => {
    return latestConfirmedWinner.subscribe((val: ConfirmedWinner | null) => {
      winner.value = val;
    });
  }, []);

  const winnerData = winner.value;

  return (
    <section id="winners" data-ui="winners-section" className="min-h-screen py-24 px-4 bg-dark-surface">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16" data-ui="winners-header">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" data-ui="winners-title">
            Ganador del Sorteo
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto" data-ui="winners-subtitle">
            {winnerData
              ? 'Tenemos ganador del sorteo de la GR Cup.'
              : 'Próximamente anunciaremos al ganador del sorteo.'}
          </p>
        </div>

        {isLoading.value ? (
          <div className="flex justify-center items-center py-16" data-ui="winners-loading">
            <div className="w-12 h-12 border-4 border-red-accent/30 border-t-red-accent rounded-full animate-spin" data-ui="winners-spinner" />
          </div>
        ) : winnerData ? (
          <div className="flex justify-center" data-ui="winners-content">
            <div
              className="group p-8 rounded-2xl bg-dark-base border border-dark-border hover:border-dark-red/50 transition-all duration-300 hover:scale-[1.02] max-w-md w-full"
              data-ui="winner-card"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-accent to-dark-red flex items-center justify-center mb-6 mx-auto" data-ui="winner-trophy-icon">
                <Icon name="trophy" size="xl" color="white" />
              </div>

              <div className="text-center" data-ui="winner-info">
                <Badge variant="warning" size="sm" className="mb-3" data-ui="winner-badge">
                  Ganador Confirmado
                </Badge>

                <h3 className="text-2xl font-bold text-white mb-1" data-ui="winner-name">
                  {winnerData.winnerName}
                </h3>

                {winnerData.winnerInstagram && (
                  <a
                    href={`https://instagram.com/${winnerData.winnerInstagram.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-accent hover:text-dark-red transition-colors mb-4 inline-block"
                    data-ui="winner-instagram-link"
                  >
                    {winnerData.winnerInstagram}
                  </a>
                )}

                <p className="text-gray-400" data-ui="winner-tickets-info">
                  {winnerData.winnerTicketCount} boleto{winnerData.winnerTicketCount !== 1 ? 's' : ''} en el sorteo
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center" data-ui="winners-placeholder">
            <div
              className="group p-8 rounded-2xl bg-dark-base border border-dark-border/50 border-dashed max-w-md w-full text-center"
              data-ui="winner-placeholder-card"
            >
              <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-6 mx-auto" data-ui="winner-placeholder-icon">
                <Icon name="trophy" size="xl" color="gray" />
              </div>
              <p className="text-gray-500 text-lg" data-ui="winner-placeholder-text">
                Aún no se ha realizado el sorteo
              </p>
            </div>
          </div>
        )}

        <div className="mt-16 text-center" data-ui="winners-cta">
          <p className="text-gray-400 mb-6" data-ui="winners-cta-text">
            {winnerData ? 'Quieres ser el próximo ganador?' : 'Participa para tener la oportunidad de ganar!'}
          </p>
          <Button
            variant="primary"
            size="xl"
            onClick={() => {
              window.location.href = '/raffle';
            }}
            className="shadow-lg shadow-red-accent/30"
            leftIcon={<Icon name="sparkles" />}
            data-ui="winners-cta-btn"
          >
            Participa Ahora
          </Button>
        </div>
      </div>
    </section>
  );
}

export default WinnersSection;
