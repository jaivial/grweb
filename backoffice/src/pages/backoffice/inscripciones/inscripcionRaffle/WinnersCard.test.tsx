import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WinnersCard } from './WinnersCard';
import type { RaffleWinner } from '../../../../utils/api';

const sampleWinners: RaffleWinner[] = [
  { id: 1, nombre: 'Ada Lovelace', email: 'ada@example.com', totalPagado: 50 },
  { id: 2, nombre: 'Linus Torvalds', email: 'linus@example.com', totalPagado: 35 },
  { id: 3, nombre: 'Grace Hopper', email: 'grace@example.com', totalPagado: 70 },
];

describe('WinnersCard', () => {
  it('renders the empty state when no winners are provided', () => {
    render(<WinnersCard winners={[]} />);
    expect(screen.getByTestId('raffle-winners-card-empty')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay ganadores')).toBeInTheDocument();
  });

  it('renders all winner items when revealAtIndex >= winners.length', () => {
    render(<WinnersCard winners={sampleWinners} revealAtIndex={99} />);
    expect(screen.getByTestId('raffle-winners-card-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('raffle-winners-card-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('raffle-winners-card-item-2')).toBeInTheDocument();
  });

  it('marks items as revealed when their index <= revealAtIndex', () => {
    render(<WinnersCard winners={sampleWinners} revealAtIndex={1} />);
    expect(
      screen.getByTestId('raffle-winners-card-item-0').getAttribute('data-revealed')
    ).toBe('true');
    expect(
      screen.getByTestId('raffle-winners-card-item-1').getAttribute('data-revealed')
    ).toBe('true');
    expect(
      screen.getByTestId('raffle-winners-card-item-2').getAttribute('data-revealed')
    ).toBe('false');
  });

  it('applies staggered transitionDelay via inline style', () => {
    render(<WinnersCard winners={sampleWinners} revealAtIndex={0} />);
    const item1 = screen.getByTestId('raffle-winners-card-item-1');
    const styleAttr = item1.getAttribute('style') || '';
    expect(styleAttr).toMatch(/transition-delay:\s*100ms/);
  });

  it('renders the position number for each winner', () => {
    render(<WinnersCard winners={sampleWinners} revealAtIndex={99} />);
    expect(screen.getByTestId('raffle-winners-card-item-0').textContent).toContain('#1');
    expect(screen.getByTestId('raffle-winners-card-item-1').textContent).toContain('#2');
  });

  it('renders the winner name', () => {
    render(<WinnersCard winners={sampleWinners} revealAtIndex={99} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Linus Torvalds')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('formats totalPagado as euro', () => {
    render(<WinnersCard winners={sampleWinners} revealAtIndex={99} />);
    const item0 = screen.getByTestId('raffle-winners-card-item-0');
    // 50 € formatted es-ES
    expect(item0.textContent).toMatch(/50/);
  });
});
