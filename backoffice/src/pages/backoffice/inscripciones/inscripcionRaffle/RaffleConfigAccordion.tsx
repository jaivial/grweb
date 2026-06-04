/**
 * RaffleConfigAccordion — configuration UI for the sorteo
 *
 * Three configuration fields wrapped in an <Accordion>:
 * - Atletas incluidos (filter criteria, 3 options)
 * - Número de ganadores (Counter, 1..max(poolSize))
 * - Igualdad por sexo (CustomSelector, only visible when numWinners >= 2)
 *
 * Reads from / writes to a Jotai RaffleStore (passed via prop) so the same
 * component works for both FER and GR Cup variants.
 */

import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Accordion, CustomSelector } from '../../../../components/ui';
import { Counter } from '../../../../components/ui/Counter/Counter';
import type { SelectOption } from '../../../../components/ui/CustomSelector/CustomSelector';
import type { RaffleStore } from '../../../../stores/raffleStoreFactory';
import {
  FILTER_CRITERIA_OPTIONS,
  EQUITY_MODE_OPTIONS,
  DEFAULT_POOL_SIZE_FALLBACK,
  formatEquityBreakdown,
} from './constants';
import type {
  RaffleConfig,
  RaffleFilterCriteria,
  RaffleEquityMode,
} from './types';

export interface RaffleConfigAccordionProps {
  store: RaffleStore;
  poolSize?: number;
  defaultOpen?: boolean;
  dataTestid?: string;
}

export function RaffleConfigAccordion({
  store,
  poolSize,
  defaultOpen = false,
  dataTestid = 'raffle-config-accordion',
}: RaffleConfigAccordionProps): JSX.Element {
  const [config, setConfig] = useAtom(store.raffleConfigAtom);
  const isEquityAvailable = useAtomValue(store.raffleIsEquityAvailableAtom);

  const counterMax = useMemo(
    () => Math.max(1, poolSize ?? DEFAULT_POOL_SIZE_FALLBACK),
    [poolSize]
  );

  const handleFilterChange = useCallback(
    (value: RaffleFilterCriteria | null) => {
      if (value === null) return;
      setConfig((prev) => ({ ...prev, filterCriteria: value }));
    },
    [setConfig]
  );

  const handleNumWinnersChange = useCallback(
    (n: number) => {
      setConfig((prev: RaffleConfig) => {
        const safeN = Math.min(Math.max(1, n), counterMax);
        return {
          ...prev,
          numWinners: safeN,
          // Coerce equity to "none" when N drops below 2
          equityMode: safeN >= 2 ? prev.equityMode : 'none',
        };
      });
    },
    [setConfig, counterMax]
  );

  const handleEquityChange = useCallback(
    (value: RaffleEquityMode | null) => {
      if (value === null) return;
      setConfig((prev) => ({ ...prev, equityMode: value }));
    },
    [setConfig]
  );

  const equityHelperText = useMemo(() => {
    if (!isEquityAvailable || config.equityMode !== 'sex') return null;
    return `Con ${config.numWinners} ganadores: ${formatEquityBreakdown(config.numWinners)}`;
  }, [isEquityAvailable, config.numWinners, config.equityMode]);

  const equitySelectorOptions = useMemo<SelectOption<RaffleEquityMode>[]>(
    () => [...EQUITY_MODE_OPTIONS],
    []
  );

  return (
    <Accordion
      title="Configuración del sorteo"
      defaultOpen={defaultOpen}
      className="w-full"
    >
      <div
        className="flex flex-col gap-5"
        data-ui="raffle-config-body"
        data-testid={dataTestid}
      >
        {/* Filter criteria */}
        <div data-ui="raffle-config-filter" data-testid="raffle-config-filter">
          <CustomSelector<RaffleFilterCriteria>
            options={[...FILTER_CRITERIA_OPTIONS]}
            value={config.filterCriteria}
            onChange={handleFilterChange}
            label="Atletas incluidos"
            placeholder="Selecciona filtro"
            allowClear={false}
            data-testid="raffle-config-filter-selector"
          />
        </div>

        {/* Number of winners */}
        <div
          className="flex flex-col items-center gap-2"
          data-ui="raffle-config-num-winners"
          data-testid="raffle-config-num-winners"
        >
          <span
            className="text-sm font-medium text-white/80 self-start"
            data-ui="raffle-config-num-winners-label"
          >
            Número de ganadores
          </span>
          <Counter
            value={config.numWinners}
            onChange={handleNumWinnersChange}
            min={1}
            max={counterMax}
            dataTestid="raffle-config-counter"
          />
          {typeof poolSize === 'number' && (
            <span
              className="text-xs text-white/50"
              data-ui="raffle-config-pool-hint"
            >
              Pool disponible: {poolSize}
            </span>
          )}
        </div>

        {/* Equity (only when N >= 2) */}
        {isEquityAvailable && (
          <div
            className="flex flex-col gap-2"
            data-ui="raffle-config-equity"
            data-testid="raffle-config-equity"
          >
            <CustomSelector<RaffleEquityMode>
              options={equitySelectorOptions}
              value={config.equityMode}
              onChange={handleEquityChange}
              label="Igualdad"
              placeholder="Selecciona modo de igualdad"
              allowClear={false}
              data-testid="raffle-config-equity-selector"
            />
            {equityHelperText && (
              <p
                className="text-xs text-white/60"
                data-ui="raffle-config-equity-helper"
                data-testid="raffle-config-equity-helper"
              >
                {equityHelperText}
              </p>
            )}
          </div>
        )}
      </div>
    </Accordion>
  );
}

export default RaffleConfigAccordion;
