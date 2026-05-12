import { useAtomValue } from 'jotai';
import type { JSX } from 'react';
import {
  isCurrentFerAtom,
  currentCompeticionIdAtom,
} from '../../../stores/auth.atoms';
import { FerInscripcionesPage } from './fer-components/FerInscripcionesPage';
import { GrCupInscripcionesPage } from './fer-components/GrCupInscripcionesPage';

export function Inscripciones(): JSX.Element {
  const isFER = useAtomValue(isCurrentFerAtom);
  const competicionId = useAtomValue(currentCompeticionIdAtom);

  if (isFER && competicionId) {
    return <FerInscripcionesPage competicionId={competicionId} />;
  }

  return <GrCupInscripcionesPage />;
}

export default Inscripciones;
