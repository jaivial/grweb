import { useEffect, useMemo, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  userCompeticionesAtom,
  currentCompeticionIdAtom,
} from '../stores/auth.atoms';

/**
 * Hook that reads the `competicionSlug` URL param and syncs it
 * with the `currentCompeticionIdAtom` Jotai atom.
 *
 * Returns helpers for building slug-aware navigation links.
 */
export function useCompeticionSlug() {
  const params = useParams();
  const competiciones = useAtomValue(userCompeticionesAtom);
  const setCurrentCompeticionId = useSetAtom(currentCompeticionIdAtom);

  const competicionSlug = params.competicionSlug ?? '';

  // Look up the competition that matches this slug
  const matchedCompeticion = useMemo(
    () => competiciones.find((c) => c.slug === competicionSlug) ?? null,
    [competiciones, competicionSlug],
  );

  // Sync the atom whenever the URL slug changes
  useEffect(() => {
    if (matchedCompeticion) {
      setCurrentCompeticionId(matchedCompeticion.id);
    }
  }, [matchedCompeticion, setCurrentCompeticionId]);

  /** Build a slug-prefixed backoffice path, e.g. buildPath('inscripciones') => '/backoffice/grcup-2026/inscripciones' */
  const buildPath = useCallback(
    (subPath: string) => {
      const base = competicionSlug
        ? `/backoffice/${competicionSlug}`
        : '/backoffice';
      if (!subPath || subPath === '') return base;
      return `${base}/${subPath}`;
    },
    [competicionSlug],
  );

  /** Get the slug of the first available competition (for redirects) */
  const firstSlug = useMemo(
    () => (competiciones.length > 0 ? competiciones[0].slug : ''),
    [competiciones],
  );

  return {
    competicionSlug,
    matchedCompeticion,
    buildPath,
    firstSlug,
    competiciones,
  };
}
