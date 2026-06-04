import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Counter } from './Counter';

describe('Counter', () => {
  it('renders the current value', () => {
    render(<Counter value={5} onChange={() => {}} />);
    expect(screen.getByTestId('counter-value')).toHaveTextContent('5');
  });

  it('renders a custom data-testid when provided', () => {
    render(<Counter value={3} onChange={() => {}} dataTestid="my-counter" />);
    expect(screen.getByTestId('my-counter')).toBeInTheDocument();
    expect(screen.getByTestId('my-counter-value')).toHaveTextContent('3');
  });

  it('increments the value when plus is clicked', () => {
    const onChange = vi.fn();
    render(<Counter value={1} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('decrements the value when minus is clicked', () => {
    const onChange = vi.fn();
    render(<Counter value={3} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('counter-minus'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('clamps at min (does not call onChange below min)', () => {
    const onChange = vi.fn();
    render(<Counter value={1} min={1} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('counter-minus'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('counter-minus')).toBeDisabled();
  });

  it('clamps at max (does not call onChange above max)', () => {
    const onChange = vi.fn();
    render(<Counter value={10} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('counter-plus')).toBeDisabled();
  });

  it('does not exceed max when incrementing', () => {
    const onChange = vi.fn();
    render(<Counter value={9} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('does not go below min when decrementing', () => {
    const onChange = vi.fn();
    render(<Counter value={2} min={1} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('counter-minus'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('renders label when provided', () => {
    render(<Counter value={0} onChange={() => {}} label="Tickets" />);
    expect(screen.getByText('Tickets')).toBeInTheDocument();
  });

  it('uses default min=0 and max=Infinity', () => {
    const onChange = vi.fn();
    render(<Counter value={0} onChange={onChange} />);
    // minus disabled at default min 0
    expect(screen.getByTestId('counter-minus')).toBeDisabled();
    fireEvent.click(screen.getByTestId('counter-plus'));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
