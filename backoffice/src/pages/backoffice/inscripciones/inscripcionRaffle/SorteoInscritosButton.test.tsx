import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { SorteoInscritosButton } from './SorteoInscritosButton';
import { createRaffleStore } from '../../../../stores/raffleStoreFactory';

describe('SorteoInscritosButton', () => {
  let store: ReturnType<typeof createStore>;
  let raffle: ReturnType<typeof createRaffleStore>;

  beforeEach(() => {
    store = createStore();
    raffle = createRaffleStore();
  });

  it('renders a "Sorteo" button with the expected data-testid', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton />
      </Provider>
    );
    expect(screen.getByTestId('sorteo-inscritos-button')).toBeInTheDocument();
    expect(screen.getByText('Sorteo')).toBeInTheDocument();
  });

  it('renders the Dices icon as SVG', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton />
      </Provider>
    );
    const svg = screen.getByTestId('sorteo-inscritos-button').querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('honors a custom label', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton label="Sortear atletas" />
      </Provider>
    );
    expect(screen.getByText('Sortear atletas')).toBeInTheDocument();
  });

  it('does not open the modal when disabled', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton disabled />
      </Provider>
    );
    fireEvent.click(screen.getByTestId('sorteo-inscritos-button'));
    expect(store.get(raffle.raffleModalOpenAtom)).toBe(false);
  });

  it('exposes competicionKind as a data attribute', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton competicionKind="grCup" />
      </Provider>
    );
    expect(
      screen.getByTestId('sorteo-inscritos-button').getAttribute('data-competicion-kind')
    ).toBe('grCup');
  });

  it('defaults competicionKind to "fer"', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton />
      </Provider>
    );
    expect(
      screen.getByTestId('sorteo-inscritos-button').getAttribute('data-competicion-kind')
    ).toBe('fer');
  });

  it('renders with the expected data-ui attribute', () => {
    render(
      <Provider store={store}>
        <SorteoInscritosButton />
      </Provider>
    );
    expect(screen.getByTestId('sorteo-inscritos-button').getAttribute('data-ui')).toBe(
      'sorteo-inscritos-button'
    );
  });

  it('opens the custom store modal when a store prop is passed', () => {
    const customStore = createRaffleStore();
    const customJotai = createStore();
    render(
      <Provider store={customJotai}>
        <SorteoInscritosButton competicionKind="grCup" store={customStore} />
      </Provider>
    );
    fireEvent.click(screen.getByTestId('sorteo-inscritos-button'));
    expect(customJotai.get(customStore.raffleModalOpenAtom)).toBe(true);
    // The default (grCup) module-level store must remain closed —
    // proves the button is not aliasing to the global grCupRaffleStore.
    expect(store.get(raffle.raffleModalOpenAtom)).toBe(false);
  });
});
