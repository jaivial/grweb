import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { JSX } from 'react';
import { useAtomValue } from 'jotai';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';
import type { LiftType } from '../../../types/lift';
import { RefreshCw, Lock, Unlock, Settings, X, Loader2, Circle, CheckCircle, XCircle } from 'lucide-react';
import { currentCompeticionAtom, isCurrentFerAtom } from '../../../stores/auth.atoms';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// ─── Types ───

interface JudgeVote {
  juez1Voto: boolean | null;
  juez2Vote: boolean | null;
  juez3Vote: boolean | null;
}

interface AttemptData {
  id: number;
  liftType: string;
  attemptNumber: number;
  weight: number;
  juez1Voto: boolean | null;
  juez2Vote: boolean | null;
  juez3Vote: boolean | null;
}

interface AthleteAttempt {
  id: number;
  nombre: string;
  email: string;
  sexo: string;
  categoriaPeso: string;
  attempts: AttemptData[];
}

// ─── Constants ───

const LIFT_ORDER: LiftType[] = ['Squat', 'Bench', 'Deadlift'];

const LIFT_TABS: { key: LiftType; label: string }[] = [
  { key: 'Squat', label: 'Sentadilla' },
  { key: 'Bench', label: 'Press de Banca' },
  { key: 'Deadlift', label: 'Peso Muerto' },
];

const SUBTABS = [
  { key: 1, label: 'Intento 1' },
  { key: 2, label: 'Intento 2' },
  { key: 3, label: 'Intento 3' },
  { key: 'all', label: 'Todos' },
] as const;

type SubtabKey = 1 | 2 | 3 | 'all';

const REFRESH_INTERVAL_MS = 30000;

const WEIGHT_CATEGORIES_MALE = [
  'Hasta 59kg',
  'Hasta 66kg',
  'Hasta 74kg',
  'Hasta 83kg',
  'Hasta 93kg',
  'Hasta 105kg',
  'Hasta 120kg',
  '+120kg',
];

const WEIGHT_CATEGORIES_FEMALE = [
  'Hasta 47kg',
  'Hasta 52kg',
  'Hasta 57kg',
  'Hasta 63kg',
  'Hasta 69kg',
  'Hasta 76kg',
  'Hasta 84kg',
  '+84kg',
];

// ─── Helpers ───

function getVoteKey(athleteId: number, liftType: string, attemptNumber: number): string {
  return `${athleteId}-${liftType}-${attemptNumber}`;
}

function getVoteResult(votes: { juez1: boolean | null; juez2: boolean | null; juez3: boolean | null }): 'valid' | 'invalid' | 'pending' {
  const whiteCount = [votes.juez1, votes.juez2, votes.juez3].filter(v => v === true).length;
  const redCount = [votes.juez1, votes.juez2, votes.juez3].filter(v => v === false).length;
  if (whiteCount >= 2) return 'valid';
  if (redCount >= 2) return 'invalid';
  return 'pending';
}

function formatNombre(nombre: string): string {
  // Try "Apellido, Nombre" or "Nombre Apellido"
  const parts = nombre.split(',').map(s => s.trim());
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
  return nombre;
}

function getNextCircleState(current: boolean | null): boolean | null {
  if (current === null) return true;   // gray -> white
  if (current === true) return false;  // white -> red
  return null;                          // red -> gray
}

// ─── Component ───

export function JudgeTablePage(): JSX.Element {
  const [athletes, setAthletes] = useState<AthleteAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Tabs
  const [activeLiftTab, setActiveLiftTab] = useState<LiftType>('Squat');
  const [activeSubtab, setActiveSubtab] = useState<SubtabKey>(1);

  // Lock state per row: key -> boolean (true = locked, false = unlocked)
  const [lockStates, setLockStates] = useState<Record<string, boolean>>({});

  // Local vote edits (dirty state before saving)
  const [localVotes, setLocalVotes] = useState<Record<string, { juez1: boolean | null; juez2: boolean | null; juez3: boolean | null }>>({});

  // Saving indicator per key
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Weight editing state
  const [editingCell, setEditingCell] = useState<{ inscripcionId: number; liftType: string; attemptNumber: number } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const editingInputRef = useRef<HTMLInputElement>(null);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMaleCats, setSelectedMaleCats] = useState<Set<string>>(new Set(WEIGHT_CATEGORIES_MALE));
  const [selectedFemaleCats, setSelectedFemaleCats] = useState<Set<string>>(new Set(WEIGHT_CATEGORIES_FEMALE));

  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const isFer = useAtomValue(isCurrentFerAtom);
  const slug = currentCompeticion?.slug ?? '';

  // ─── Fetch data ───

  const fetchData = useCallback(async () => {
    if (!isFer || !slug) {
      setLoading(false);
      return;
    }
    try {
      // Build category filter
      const selectedCats = [...selectedMaleCats, ...selectedFemaleCats];
      const params = selectedCats.length > 0 && selectedCats.length < (WEIGHT_CATEGORIES_MALE.length + WEIGHT_CATEGORIES_FEMALE.length) ? `?categorias=${selectedCats.join(',')}` : '';

      const result = await api.getFerCompetitionAttempts(slug, params);
      const raw = result?.data ?? [];
      const list: AthleteAttempt[] = Array.isArray(raw) ? raw.map((item: any) => ({
        id: item.id,
        nombre: item.nombre ?? '',
        email: item.email ?? '',
        sexo: item.sexo ?? '',
        categoriaPeso: item.categoriaPeso ?? '',
        attempts: Array.isArray(item.attempts) ? item.attempts.map((a: any) => ({
          id: a.id,
          liftType: a.liftType,
          attemptNumber: a.attemptNumber,
          weight: a.weight,
          juez1Voto: a.juez1Voto ?? null,
          juez2Vote: a.juez2Vote ?? null,
          juez3Vote: a.juez3Vote ?? null,
        })) : [],
      })) : [];

      setAthletes(list);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Error al cargar los datos de la competencia.');
    } finally {
      setLoading(false);
    }
  }, [isFer, slug, selectedMaleCats, selectedFemaleCats]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  // Auto-focus editing input
  useEffect(() => {
    if (editingCell && editingInputRef.current) {
      editingInputRef.current.focus();
      editingInputRef.current.select();
    }
  }, [editingCell]);

  // ─── Derived: filtered attempts ───

  const filteredRows = useMemo(() => {
    return athletes
      .map((athlete) => {
        const matchingAttempts = athlete.attempts.filter(
          (a) => a.liftType === activeLiftTab
        );
        return { athlete, matchingAttempts };
      })
      .filter(({ matchingAttempts }) => matchingAttempts.length > 0);
  }, [athletes, activeLiftTab]);

  // ─── Vote helpers ───

  const getDisplayVotes = useCallback(
    (athleteId: number, liftType: string, attemptNumber: number): { juez1: boolean | null; juez2: boolean | null; juez3: boolean | null } => {
      const key = getVoteKey(athleteId, liftType, attemptNumber);
      // Prefer local edits
      if (localVotes[key]) return localVotes[key];
      // Fall back to server data
      const row = athletes.find((a) => a.id === athleteId);
      if (!row) return { juez1: null, juez2: null, juez3: null };
      const att = row.attempts.find((a) => a.liftType === liftType && a.attemptNumber === attemptNumber);
      if (!att) return { juez1: null, juez2: null, juez3: null };
      return { juez1: att.juez1Voto, juez2: att.juez2Voto, juez3: att.juez3Voto };
    },
    [localVotes, athletes],
  );

  const isLocked = useCallback(
    (athleteId: number, liftType: string, attemptNumber: number): boolean => {
      const key = getVoteKey(athleteId, liftType, attemptNumber);
      return lockStates[key] !== false; // default locked
    },
    [lockStates],
  );

  const handleToggleLock = useCallback(
    (athleteId: number, liftType: string, attemptNumber: number) => {
      const key = getVoteKey(athleteId, liftType, attemptNumber);
      const currentlyLocked = lockStates[key] !== false;

      if (currentlyLocked) {
        // Unlock — allow editing, re-initialize local votes from server
        const votes = getDisplayVotes(athleteId, liftType, attemptNumber);
        setLocalVotes((prev) => ({ ...prev, [key]: { ...votes } }));
        setLockStates((prev) => ({ ...prev, [key]: false }));
      } else {
        // Lock — save votes
        const votesToSave = localVotes[key];
        if (votesToSave) {
          setSavingKeys((prev) => new Set(prev).add(key));

          const saves: Promise<any>[] = [];
          const judgeMap: { field: keyof typeof votesToSave; num: number }[] = [
            { field: 'juez1', num: 1 },
            { field: 'juez2', num: 2 },
            { field: 'juez3', num: 3 },
          ];

          for (const { field, num } of judgeMap) {
            const voto = votesToSave[field];
            saves.push(
              api.updateJudgeVote(slug, athleteId, liftType, attemptNumber, num, voto),
            );
          }

          Promise.all(saves)
            .then(() => {
              toast.success('Votos guardados correctamente');
              setLockStates((prev) => ({ ...prev, [key]: true }));
              // After save, clear local votes since they match server now
              setLocalVotes((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            })
            .catch(() => {
              toast.error('Error al guardar votos');
            })
            .finally(() => {
              setSavingKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
            });
        } else {
          setLockStates((prev) => ({ ...prev, [key]: true }));
        }
      }
    },
    [lockStates, localVotes, slug, getDisplayVotes],
  );

  const handleCircleClick = useCallback(
    (athleteId: number, liftType: string, attemptNumber: number, judgeNum: 1 | 2 | 3) => {
      const key = getVoteKey(athleteId, liftType, attemptNumber);
      const current = localVotes[key] ?? getDisplayVotes(athleteId, liftType, attemptNumber);
      const judgeField = judgeNum === 1 ? 'juez1' : judgeNum === 2 ? 'juez2' : 'juez3';
      const nextVal = getNextCircleState(current[judgeField]);
      const updated = { ...current, [judgeField]: nextVal };
      setLocalVotes((prev) => ({ ...prev, [key]: updated }));
    },
    [localVotes, getDisplayVotes],
  );

  // ─── Weight editing ───

  const handleStartEdit = useCallback(
    (inscripcionId: number, liftType: string, attemptNumber: number, currentWeight: number) => {
      setEditingCell({ inscripcionId, liftType, attemptNumber });
      setEditingValue(currentWeight > 0 ? String(currentWeight) : '');
    },
    [],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editingCell) return;
    const { inscripcionId, liftType, attemptNumber } = editingCell;
    const newWeight = parseFloat(editingValue);
    if (isNaN(newWeight) || newWeight < 0) {
      setEditingCell(null);
      return;
    }
    const key = getVoteKey(inscripcionId, liftType, attemptNumber);
    setSavingKeys((prev) => new Set(prev).add(key));
    setEditingCell(null);
    try {
      await api.updateAttemptWeight(slug, inscripcionId, liftType, attemptNumber, newWeight);
      toast.success('Peso actualizado');
      fetchData();
    } catch {
      toast.error('Error al actualizar peso');
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [editingCell, editingValue, slug, fetchData]);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // ─── Category toggle ───

  const handleToggleMaleCat = useCallback((cat: string) => {
    setSelectedMaleCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleToggleFemaleCat = useCallback((cat: string) => {
    setSelectedFemaleCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // ─── Render: loading ───

  if (loading) {
    return (
      <BackofficeLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-red-accent animate-spin" />
          <span className="ml-3 text-gray-400">Cargando mesa de jueces...</span>
        </div>
      </BackofficeLayout>
    );
  }

  if (!isFer || !slug) {
    return (
      <BackofficeLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-gray-400">La mesa de jueces solo está disponible en modo FER.</p>
        </div>
      </BackofficeLayout>
    );
  }

  // ─── Render: main ───

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8">
        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl xs:text-2xl font-bold text-white">Mesa de Jueces</h1>
            <p className="text-sm text-gray-400 mt-0.5">Votación de intentos en tiempo real</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span>
                {lastUpdated
                  ? `Actualizado: ${lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : 'Conectando...'}
              </span>
            </div>
            <button
              onClick={() => setShowSettings((p) => !p)}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                showSettings
                  ? 'text-red-accent bg-red-accent/10'
                  : 'text-gray-400 hover:text-white bg-white/5 hover:bg-white/10',
              )}
              aria-label="Configuración"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={fetchData}
              className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Refrescar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── Settings panel ─── */}
        {showSettings && (
          <div className="mb-4 bg-dark-surface/80 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Filtrar por categorías de peso</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Masculino */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Masculino</p>
                <div className="space-y-1.5">
                  {WEIGHT_CATEGORIES_MALE.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedMaleCats.has(cat)}
                        onChange={() => handleToggleMaleCat(cat)}
                        className="rounded border-white/20 bg-white/5 text-red-accent focus:ring-red-accent/50"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Femenino */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Femenino</p>
                <div className="space-y-1.5">
                  {WEIGHT_CATEGORIES_FEMALE.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedFemaleCats.has(cat)}
                        onChange={() => handleToggleFemaleCat(cat)}
                        className="rounded border-white/20 bg-white/5 text-red-accent focus:ring-red-accent/50"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Error ─── */}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ─── Lift tabs ─── */}
        <div className="flex gap-1 mb-1">
          {LIFT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveLiftTab(tab.key)}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
                activeLiftTab === tab.key
                  ? 'bg-dark-surface text-white border-b-2 border-red-accent'
                  : 'text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Subtab bar ─── */}
        <div className="flex gap-1 mb-4 border-b border-white/10 pb-2">
          {SUBTABS.map((sub) => (
            <button
              key={String(sub.key)}
              onClick={() => setActiveSubtab(sub.key)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                activeSubtab === sub.key
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {sub.label}
            </button>
          ))}
        </div>

        {/* ─── Table ─── */}

        {filteredRows.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No hay datos para esta selección</p>
            <p className="text-sm mt-1">Los datos se actualizan automáticamente cada 5 segundos</p>
          </div>
        )}

        {filteredRows.length > 0 && (
          <div className="overflow-x-auto">
            {/* Columns header */}
            {activeSubtab === 'all' ? (
              /* ─── TODOS subtab ─── */
              <div
                className="grid gap-2 px-4 py-2 text-xs text-gray-500 font-medium border-b border-white/10 mb-1"
                style={{ gridTemplateColumns: '1fr 120px 70px 90px 90px 90px 100px' }}
              >
                <span>Nombre</span>
                <span>Categoría</span>
                <span>Sexo</span>
                <span className="text-center">Intento 1</span>
                <span className="text-center">Intento 2</span>
                <span className="text-center">Intento 3</span>
                <span className="text-center">Resultado</span>
              </div>
            ) : (
              /* ─── Single attempt subtab ─── */
              <div
                className="grid gap-2 px-4 py-2 text-xs text-gray-500 font-medium border-b border-white/10 mb-1 items-center"
                style={{ gridTemplateColumns: '1fr 120px 70px 80px 1fr' }}
              >
                <span>Nombre</span>
                <span>Categoría</span>
                <span>Sexo</span>
                <span className="text-center">Peso (kg)</span>
                <span className="text-center">Válido</span>
              </div>
            )}

            {/* Rows */}
            {filteredRows.map(({ athlete, matchingAttempts }) => {
              if (activeSubtab === 'all') {
                // ─── Todos row ───
                const att1 = matchingAttempts.find((a) => a.attemptNumber === 1);
                const att2 = matchingAttempts.find((a) => a.attemptNumber === 2);
                const att3 = matchingAttempts.find((a) => a.attemptNumber === 3);

                // Compute best result
                const allVotes = [att1, att2, att3].map((att) => {
                  if (!att) return null;
                  const votes = getDisplayVotes(athlete.id, activeLiftTab, att.attemptNumber);
                  return { weight: att.weight, result: getVoteResult(votes) };
                });

                const bestResult = allVotes.reduce<{ weight: number; result: string } | null>((best, cur) => {
                  if (!cur) return best;
                  if (cur.result === 'valid' && (!best || cur.weight > best.weight)) {
                    return { weight: cur.weight, result: 'valid' };
                  }
                  return best;
                }, null);

                const resultadoLabel = bestResult
                  ? `${bestResult.weight} kg`
                  : allVotes.some((v) => v?.result === 'invalid')
                    ? 'Sin marca'
                    : '—';

                const resultadoColor = bestResult
                  ? 'text-green-400'
                  : allVotes.some((v) => v?.result === 'invalid')
                    ? 'text-red-400'
                    : 'text-gray-500';

                return (
                  <div
                    key={athlete.id}
                    className="grid gap-2 px-4 py-2.5 border-b border-white/5 last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                    style={{ gridTemplateColumns: '1fr 120px 70px 90px 90px 90px 100px' }}
                  >
                    <span className="text-sm text-white font-medium truncate">{formatNombre(athlete.nombre)}</span>
                    <span className="text-xs text-gray-400">{athlete.categoriaPeso}</span>
                    <span className="text-xs text-gray-400">{athlete.sexo === 'M' ? 'M' : 'F'}</span>
                    {[1, 2, 3].map((num) => {
                      const att = num === 1 ? att1 : num === 2 ? att2 : att3;
                      const isEditing = editingCell?.inscripcionId === athlete.id
                        && editingCell?.liftType === activeLiftTab
                        && editingCell?.attemptNumber === num;
                      const weightKey = getVoteKey(athlete.id, activeLiftTab, num);
                      const isSavingWeight = savingKeys.has(weightKey);

                      if (isEditing) {
                        return (
                          <div key={num} className="flex items-center justify-center">
                            <input
                              ref={editingInputRef}
                              type="number"
                              step="0.5"
                              min="0"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              onBlur={handleSaveEdit}
                              className="w-20 px-1.5 py-0.5 text-sm font-mono text-center bg-dark-surface border border-red-accent/50 rounded text-white outline-none"
                            />
                          </div>
                        );
                      }

                      return (
                        <span
                          key={num}
                          className={clsx(
                            'text-sm font-mono text-center',
                            att ? 'cursor-pointer hover:text-red-accent transition-colors text-gray-300' : 'text-gray-500',
                            isSavingWeight && 'text-yellow-400',
                          )}
                          onClick={() => {
                            if (att) handleStartEdit(athlete.id, activeLiftTab, num, att.weight);
                          }}
                          title={att ? 'Click para editar peso' : undefined}
                        >
                          {isSavingWeight ? (
                            <Loader2 className="w-4 h-4 inline-block animate-spin" />
                          ) : att ? (
                            att.weight
                          ) : (
                            '-'
                          )}
                        </span>
                      );
                    })}
                    <span className={`text-sm font-semibold text-center ${resultadoColor}`}>{resultadoLabel}</span>
                  </div>
                );
              }

              // ─── Single attempt subtab ───
              const attemptNum = activeSubtab as 1 | 2 | 3;
              const attempt = matchingAttempts.find((a) => a.attemptNumber === attemptNum);
              if (!attempt) {
                return (
                  <div
                    key={athlete.id}
                    className="grid gap-2 px-4 py-2.5 border-b border-white/5 last:border-b-0 items-center opacity-40"
                    style={{ gridTemplateColumns: '1fr 120px 70px 80px 1fr' }}
                  >
                    <span className="text-sm text-gray-400 font-medium truncate">{formatNombre(athlete.nombre)}</span>
                    <span className="text-xs text-gray-500">{athlete.categoriaPeso}</span>
                    <span className="text-xs text-gray-500">{athlete.sexo === 'M' ? 'M' : 'F'}</span>
                    <span className="text-sm text-gray-500 font-mono text-center">—</span>
                    <span className="text-xs text-gray-600 text-center">Sin intento</span>
                  </div>
                );
              }

              const key = getVoteKey(athlete.id, activeLiftTab, attemptNum);
              const locked = lockStates[key] !== false;
              const votes = getDisplayVotes(athlete.id, activeLiftTab, attemptNum);
              const savingThis = savingKeys.has(key);

              return (
                <div
                  key={athlete.id}
                  className="grid gap-2 px-4 py-2.5 border-b border-white/5 last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                  style={{ gridTemplateColumns: '1fr 120px 70px 80px 1fr' }}
                >
                  <span className="text-sm text-white font-medium truncate">{formatNombre(athlete.nombre)}</span>
                  <span className="text-xs text-gray-400">{athlete.categoriaPeso}</span>
                  <span className="text-xs text-gray-400">{athlete.sexo === 'M' ? 'M' : 'F'}</span>
                  {(() => {
                    const isEditing = editingCell?.inscripcionId === athlete.id
                      && editingCell?.liftType === activeLiftTab
                      && editingCell?.attemptNumber === attemptNum;
                    const weightKey = getVoteKey(athlete.id, activeLiftTab, attemptNum);
                    const isSavingWeight = savingKeys.has(weightKey);

                    if (isEditing) {
                      return (
                        <div className="flex items-center justify-center">
                          <input
                            ref={editingInputRef}
                            type="number"
                            step="0.5"
                            min="0"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            onBlur={handleSaveEdit}
                            className="w-20 px-1.5 py-0.5 text-sm font-mono text-center bg-dark-surface border border-red-accent/50 rounded text-white outline-none"
                          />
                        </div>
                      );
                    }

                    return (
                      <span
                        className={clsx(
                          'text-sm font-mono font-semibold text-center cursor-pointer hover:text-red-accent transition-colors',
                          isSavingWeight ? 'text-yellow-400' : 'text-white',
                        )}
                        onClick={() => handleStartEdit(athlete.id, activeLiftTab, attemptNum, attempt.weight)}
                        title="Click para editar peso"
                      >
                        {isSavingWeight ? (
                          <Loader2 className="w-4 h-4 inline-block animate-spin" />
                        ) : (
                          attempt.weight > 0 ? attempt.weight : '-'
                        )}
                      </span>
                    );
                  })()}

                  {/* Válido column */}
                  <div className="flex items-center justify-center gap-2">
                    {/* Lock button */}
                    <button
                      onClick={() => handleToggleLock(athlete.id, activeLiftTab, attemptNum)}
                      disabled={savingThis}
                      className={clsx(
                        'p-1 rounded transition-colors',
                        locked
                          ? 'text-gray-500 hover:text-gray-300'
                          : 'text-yellow-400 hover:text-yellow-300',
                        savingThis && 'opacity-50 cursor-not-allowed',
                      )}
                      aria-label={locked ? 'Desbloquear' : 'Bloquear y guardar'}
                    >
                      {savingThis ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : locked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </button>

                    {/* Judge circles */}
                    {([1, 2, 3] as const).map((judgeNum) => {
                      const judgeField = judgeNum === 1 ? 'juez1' : judgeNum === 2 ? 'juez2' : 'juez3';
                      const val = votes[judgeField];
                      return (
                        <button
                          key={judgeNum}
                          onClick={() => {
                            if (!locked && !savingThis) {
                              handleCircleClick(athlete.id, activeLiftTab, attemptNum, judgeNum);
                            }
                          }}
                          disabled={locked || savingThis}
                          className={clsx(
                            'transition-all duration-150',
                            locked ? 'cursor-default' : 'cursor-pointer hover:scale-110',
                            (locked || savingThis) && 'opacity-80',
                          )}
                          aria-label={`Juez ${judgeNum}: ${val === null ? 'sin voto' : val ? 'válido' : 'inválido'}`}
                        >
                          {val === null ? (
                            <Circle className="w-5 h-5 text-gray-600" />
                          ) : val === true ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}
