import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { RaffleConfigAccordion } from './RaffleConfigAccordion';
import { createRaffleStore } from '../../../../stores/raffleStoreFactory';

function selectOption(testIdPrefix: string, optionIndex = 0) {
  const wrapper = screen.getByTestId(testIdPrefix);
  const trigger = within(wrapper).getByRole('button');
  fireEvent.click(trigger);
  const options = screen.getAllByRole('option');
  fireEvent.click(options[optionIndex]);
}

describe('RaffleConfigAccordion', () => {
  let store: ReturnType<typeof createStore>;
  let raffle: ReturnType<typeof createRaffleStore>;

  beforeEach(() => {
    store = createStore();
    raffle = createRaffleStore();
  });

  const renderWithProvider = () =>
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} />
      </Provider>
    );

  it('renders the accordion trigger with the config title', () => {
    renderWithProvider();
    expect(screen.getByText('Configuración del sorteo')).toBeInTheDocument();
  });

  it('starts closed (default)', () => {
    renderWithProvider();
    expect(screen.getByTestId('raffle-config-accordion')).toBeInTheDocument();
  });

  it('opens when the accordion trigger is clicked', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('Configuración del sorteo'));
    expect(screen.getByTestId('raffle-config-filter')).toBeInTheDocument();
    expect(screen.getByTestId('raffle-config-num-winners')).toBeInTheDocument();
  });

  it('renders with defaultOpen when set', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    expect(screen.getByTestId('raffle-config-filter')).toBeInTheDocument();
  });

  it('hides the equity selector at default numWinners=1', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    expect(screen.queryByTestId('raffle-config-equity')).toBeNull();
  });

  it('shows the equity selector when numWinners is incremented to 2', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    fireEvent.click(screen.getByTestId('counter-plus'));
    fireEvent.click(screen.getByTestId('counter-plus'));
    // 1 -> 3 with two clicks (1 + 2 = 3)
    expect(store.get(raffle.raffleConfigAtom).numWinners).toBe(3);
    expect(screen.getByTestId('raffle-config-equity')).toBeInTheDocument();
  });

  it('counter clamps at min=1', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    const minus = screen.getByTestId('counter-minus');
    expect(minus).toBeDisabled();
    fireEvent.click(minus);
    expect(store.get(raffle.raffleConfigAtom).numWinners).toBe(1);
  });

  it('counter clamps at poolSize when provided', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen poolSize={3} />
      </Provider>
    );
    // increment to 3 (the cap)
    fireEvent.click(screen.getByTestId('counter-plus'));
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(store.get(raffle.raffleConfigAtom).numWinners).toBe(3);
    // next click should not exceed 3
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(store.get(raffle.raffleConfigAtom).numWinners).toBe(3);
  });

  it('changing the filter selector writes to raffleConfigAtom', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    selectOption('raffle-config-filter-selector', 1); // onlyPaid
    expect(store.get(raffle.raffleConfigAtom).filterCriteria).toBe('onlyPaid');
  });

  it('shows equity helper text when equity=sex and numWinners>=2', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    // bump to 4
    fireEvent.click(screen.getByTestId('counter-plus'));
    fireEvent.click(screen.getByTestId('counter-plus'));
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(store.get(raffle.raffleConfigAtom).numWinners).toBe(4);
    // select sex equity
    selectOption('raffle-config-equity-selector', 1);
    expect(store.get(raffle.raffleConfigAtom).equityMode).toBe('sex');
    expect(screen.getByTestId('raffle-config-equity-helper')).toHaveTextContent(
      /Con 4 ganadores/
    );
  });

  it('coerces equityMode to "none" when numWinners drops below 2', () => {
    render(
      <Provider store={store}>
        <RaffleConfigAccordion store={raffle} defaultOpen />
      </Provider>
    );
    // bump to 3
    fireEvent.click(screen.getByTestId('counter-plus'));
    fireEvent.click(screen.getByTestId('counter-plus'));
    // select sex
    selectOption('raffle-config-equity-selector', 1);
    expect(store.get(raffle.raffleConfigAtom).equityMode).toBe('sex');
    // drop to 1
    fireEvent.click(screen.getByTestId('counter-minus'));
    fireEvent.click(screen.getByTestId('counter-minus'));
    expect(store.get(raffle.raffleConfigAtom).numWinners).toBe(1);
    expect(store.get(raffle.raffleConfigAtom).equityMode).toBe('none');
  });
});
