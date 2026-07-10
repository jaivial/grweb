import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventoCapacityFields } from './EventoCapacityFields';
import { DEFAULT_EVENTO_CONFIG } from '../constants';

const baseForm = { ...DEFAULT_EVENTO_CONFIG };

function renderFields(overrides: Partial<typeof baseForm> = {}, handlers: {
  onClose?: (soldOut: boolean) => void;
  onReopen?: () => void;
} = {}) {
  const onClose = handlers.onClose ?? vi.fn();
  const onReopen = handlers.onReopen ?? vi.fn();
  render(
    <EventoCapacityFields
      form={{ ...baseForm, ...overrides }}
      disabled={false}
      onUpdate={vi.fn()}
      onCloseInscripciones={onClose}
      onReopenInscripciones={onReopen}
      isFer
    />
  );
  return { onClose, onReopen };
}

describe('EventoCapacityFields', () => {
  it('allows an aforo maximo of 0 (min is 0, not 1)', () => {
    renderFields();
    const input = screen.getByTestId('evento-input-aforMaximo') as HTMLInputElement;
    expect(input.min).toBe('0');
  });

  it('renders a close-inscripciones button when inscripciones are open', () => {
    renderFields({ inscripcionesAbiertas: true });
    expect(screen.getByTestId('evento-toggle-inscripciones-btn')).toHaveTextContent(/cerrar inscripciones/i);
  });

  it('renders an open-inscripciones button when inscripciones are closed', () => {
    renderFields({ inscripcionesAbiertas: false });
    expect(screen.getByTestId('evento-toggle-inscripciones-btn')).toHaveTextContent(/abrir inscripciones/i);
  });

  it('opens the reason modal when clicking close inscripciones', () => {
    renderFields({ inscripcionesAbiertas: true });
    fireEvent.click(screen.getByTestId('evento-toggle-inscripciones-btn'));
    expect(screen.getByText(/¿por qué quieres cerrar inscripciones\?/i)).toBeInTheDocument();
    expect(screen.getByTestId('cerrar-option-temporal')).toBeInTheDocument();
    expect(screen.getByTestId('cerrar-option-soldout')).toBeInTheDocument();
    expect(screen.getByTestId('cerrar-inscripciones-confirm')).toBeInTheDocument();
  });

  it('confirms a temporary close with soldOut=false', () => {
    const { onClose } = renderFields({ inscripcionesAbiertas: true });
    fireEvent.click(screen.getByTestId('evento-toggle-inscripciones-btn'));
    fireEvent.click(screen.getByTestId('cerrar-option-temporal'));
    fireEvent.click(screen.getByTestId('cerrar-inscripciones-confirm'));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('confirms a sold-out close with soldOut=true', () => {
    const { onClose } = renderFields({ inscripcionesAbiertas: true });
    fireEvent.click(screen.getByTestId('evento-toggle-inscripciones-btn'));
    fireEvent.click(screen.getByTestId('cerrar-option-soldout'));
    fireEvent.click(screen.getByTestId('cerrar-inscripciones-confirm'));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('reopens inscripciones directly without a modal', () => {
    const { onReopen } = renderFields({ inscripcionesAbiertas: false });
    fireEvent.click(screen.getByTestId('evento-toggle-inscripciones-btn'));
    expect(onReopen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/¿por qué quieres cerrar inscripciones\?/i)).not.toBeInTheDocument();
  });
});
