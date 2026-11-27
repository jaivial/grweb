/**
 * Puntuación IPF GL 2020 (fórmula oficial): GL = resultado × 100 / (A − B · e^(−C · peso corporal)). Ocho juegos de
 * coeficientes: sexo × equipado/clásico × powerlifting (sentadilla + banca + peso muerto) / press de banca.
 */
export interface CoeficientesGl {
  A: number;
  B: number;
  C: number;
  /** Peso corporal mínimo en kg (por debajo, la fórmula no aplica). */
  pesoMin: number;
}

const COEFICIENTES: Record<'F' | 'M', Record<'pl' | 'bp', { equipado: CoeficientesGl; clasico: CoeficientesGl }>> = {
  M: {
    pl: {
      equipado: { A: 1236.25115, B: 1449.21864, C: 0.01644, pesoMin: 40 },
      clasico: { A: 1199.72839, B: 1025.18162, C: 0.00921, pesoMin: 40 },
    },
    bp: {
      equipado: { A: 381.22073, B: 733.79378, C: 0.02398, pesoMin: 40 },
      clasico: { A: 320.98041, B: 281.40258, C: 0.01008, pesoMin: 40 },
    },
  },
  F: {
    pl: {
      equipado: { A: 758.63878, B: 949.31382, C: 0.02435, pesoMin: 35 },
      clasico: { A: 610.32796, B: 1045.59282, C: 0.03048, pesoMin: 35 },
    },
    bp: {
      equipado: { A: 221.82209, B: 357.00377, C: 0.02937, pesoMin: 35 },
      clasico: { A: 142.40398, B: 442.52671, C: 0.04724, pesoMin: 35 },
    },
  },
};

/**
 * La puntuación GL de un resultado (kg) con el peso corporal (kg). `null` si falta el dato o el peso está por debajo
 * del mínimo del sexo (40 kg hombres, 35 kg mujeres). `soloBanca`: press de banca en vez de powerlifting.
 */
export function ipfGl(resultadoKg: number, pesoKg: number, sexo: 'F' | 'M', opts: { equipado?: boolean; soloBanca?: boolean } = {}): number | null {
  if (!(resultadoKg > 0) || !(pesoKg > 0)) return null;
  const c = COEFICIENTES[sexo][opts.soloBanca ? 'bp' : 'pl'][opts.equipado ? 'equipado' : 'clasico'];
  if (pesoKg < c.pesoMin) return null;
  return (resultadoKg * 100) / (c.A - c.B * Math.exp(-c.C * pesoKg));
}
