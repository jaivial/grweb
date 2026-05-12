export interface EventoConfigFormData {
  aforMaximo: number;
  precioBase: number;
  precioUpsell: number;
  precioRifa: number;
  precioHandler: number;
  maxTicketsPorPersona: number;
  inscripcionAbierta: boolean;
}

export interface EventoConfigEditorProps {
  competicionId: number;
  canManageConfig: boolean;
}
