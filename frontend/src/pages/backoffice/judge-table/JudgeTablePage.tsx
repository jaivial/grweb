import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useAtomValue } from 'jotai';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';
import type { LiftType } from '../../../types/lift';
import { RefreshCw, Clock, ChevronDown, ChevronRight, Save, X, History, Loader2 } from 'lucide-react';
import { currentCompeticionAtom, isCurrentFerAtom } from '../../../stores/auth.atoms';

// ─── Types ───

interface AthleteAttempt {
  athleteId: number;
  firstName: string;
  surname: string;
  weightCategory: string;
  sex: string;
  club: string | null;
  attempts: {
    liftType: LiftType;
    attemptNumber: number;
    weight: number;
    updatedAt: string;
  }[];
}

interface AuditEntry {
  id: number;
  athleteId: number;
  liftType: string;
  attemptNumber: number;
  oldWeight: number | null;
  newWeight: number;
  changedBy: string | null;
  changedAt: string;
}

type AttemptRow = AthleteAttempt & {
  currentLift: LiftType | null;
  currentAttempt: number;
  currentWeight: number;
  nextAttempt: number;
  nextLift: LiftType;
};

// ─── Constants ───

const LIFT_ORDER: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
const LIFT_LABELS: Record<LiftType, string> = { Squat: 'Squat', Bench: 'Bench', Deadlift: 'Deadlift' };
const REFRESH_INTERVAL_MS = 5000;
const WEIGHT_MIN = 0;
const WEIGHT_MAX = 600;

const LIFT_COLORS: Record<LiftType, string> = {
  Squat: 'text-blue-400',
  Bench: 'text-purple-400',
  Deadlift: 'text-orange-400',
};

// ─── Helpers ───

function getNextAttemptInfo(attempts: AttemptRow['attempts']): {
  lift: LiftType; attempt: number;
} {
  for (const lift of LIFT_ORDER) {
    for (let n = 1; n <= 4; n++) {
      const has = attempts.some((a) => a.liftType === lift && a.attemptNumber === n);
      if (!has) return { lift, attempt: n };
    }
  }
  return { lift: 'Deadlift', attempt: 4 };
}

function getCurrentAttemptInfo(attempts: AttemptRow['attempts']): {
  lift: LiftType | null; attempt: number; weight: number;
} {
  for (const lift of LIFT_ORDER) {
    const liftAttempts = attempts.filter((a) => a.liftType === lift);
    if (liftAttempts.length === 0) continue;
    const maxAttempt = Math.max(...liftAttempts.map((a) => a.attemptNumber));
    const entry = liftAttempts.find((a) => a.attemptNumber === maxAttempt);
    return { lift, attempt: maxAttempt, weight: entry?.weight ?? 0 };
  }
  return { lift: null, attempt: 0, weight: 0 };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isCurrentAthlete(row: AttemptRow): boolean {
  if (!row.currentLift) return false;
  const next = getNextAttemptInfo(row.attempts);
  return next.lift === row.currentLift && next.attempt === row.currentAttempt + 1;
}

// ─── Component ───

export function JudgeTablePage(): JSX.Element {
  const [athletes, setAthletes] = useState<AthleteAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [editingWeights, setEditingWeights] = useState<Record<number, string>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [auditPanelAthlete, setAuditPanelAthlete] = useState<{ id: number; name: string } | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const isFer = useAtomValue(isCurrentFerAtom);
  const slug = currentCompeticion?.slug ?? '';

  // ─── Fetch data ───

  const fetchData = useCallback(async () => {
    try {
      let list: AthleteAttempt[];
      if (isFer && slug) {
        const result = await api.getFerCompetitionAttempts(slug);
        const raw = result?.data ?? [];
        list = (Array.isArray(raw) ? raw : []).map((item: any) => {
          // Parse nombre: try "Apellido, Nombre" or "Nombre Apellido" formats
          const nameParts = (item.nombre ?? '').split(',').map((s: string) => s.trim());
          let firstName: string, surname: string;
          if (nameParts.length >= 2) {
            surname = nameParts[0];
            firstName = nameParts[1];
          } else {
            const spaceIdx = nameParts[0].lastIndexOf(' ');
            if (spaceIdx > 0) {
              surname = nameParts[0].substring(spaceIdx + 1);
              firstName = nameParts[0].substring(0, spaceIdx);
            } else {
              surname = nameParts[0];
              firstName = '';
            }
          }
          return {
            athleteId: item.id,
            firstName,
            surname,
            weightCategory: item.categoriaPeso ?? '',
            sex: item.sexo ?? '',
            club: null,
            attempts: Array.isArray(item.attempts) ? item.attempts.map((a: any) => ({
              liftType: a.liftType as LiftType,
              attemptNumber: a.attemptNumber,
              weight: a.weight,
              updatedAt: a.updatedAt,
            })) : [],
          };
        });
      } else {
        const data = await api.getCompetitionAttempts();
        list = Array.isArray(data) ? data : data?.athletes ?? [];
      }
      setAthletes(list);
      setLastUpdated(new Date());
      setError(null);

      // Auto-expand categories that have athletes
      if (expandedCategories.size === 0 && list.length > 0) {
        const cats = new Set(list.map((a) => a.weightCategory));
        setExpandedCategories(cats);
      }
    } catch {
      setError('Error al cargar los datos de intentos.');
    } finally {
      setLoading(false);
    }
  }, [isFer, slug, expandedCategories.size]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  // ─── Derived data ───

  const rows: AttemptRow[] = useMemo(() =>
    athletes.map((a) => {
      const current = getCurrentAttemptInfo(a.attempts);
      const next = getNextAttemptInfo(a.attempts);
      return { ...a, currentLift: current.lift, currentAttempt: current.attempt, currentWeight: current.weight, nextAttempt: next.attempt, nextLift: next.lift };
    }),
    [athletes],
  );

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, AttemptRow[]>();
    for (const row of rows) {
      const cat = row.weightCategory || 'Sin categoria';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    }
    // Sort athletes within each category: current athlete first, then by name
    for (const [, group] of map) {
      group.sort((a, b) => {
        const aCurrent = isCurrentAthlete(a) ? 0 : 1;
        const bCurrent = isCurrentAthlete(b) ? 0 : 1;
        if (aCurrent !== bCurrent) return aCurrent - bCurrent;
        return `${a.surname} ${a.firstName}`.localeCompare(`${b.surname} ${b.firstName}`);
      });
    }
    return map;
  }, [rows]);

  const sortedCategories = useMemo(() =>
    Array.from(groupedByCategory.keys()).sort(),
    [groupedByCategory],
  );

  const currentAthleteId = useMemo(() => {
    // Find the first "current" athlete across all categories
    for (const [, group] of groupedByCategory) {
      const found = group.find((r) => isCurrentAthlete(r));
      if (found) return found.athleteId;
    }
    return null;
  }, [groupedByCategory]);

  // ─── Handlers ───

  const handleToggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleWeightChange = useCallback((athleteId: number, value: string) => {
    setEditingWeights((prev) => ({ ...prev, [athleteId]: value }));
  }, []);

  const handleSaveAttempt = useCallback(async (athleteId: number) => {
    if (isFer) return; // FER mode is read-only — lifts are set via QR reader
    const raw = editingWeights[athleteId];
    const weight = Number(raw);
    if (isNaN(weight) || weight < WEIGHT_MIN || weight > WEIGHT_MAX) return;

    const row = rows.find((r) => r.athleteId === athleteId);
    if (!row) return;

    setSavingIds((prev) => new Set(prev).add(athleteId));
    try {
      await api.updateAttempt(athleteId, row.nextLift, row.nextAttempt, weight);
      setEditingWeights((prev) => {
        const next = { ...prev };
        delete next[athleteId];
        return next;
      });
      await fetchData();
    } catch {
      /* silently fail, auto-refresh will sync */
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(athleteId);
        return next;
      });
    }
  }, [isFer, editingWeights, rows, fetchData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, athleteId: number) => {
    if (e.key === 'Enter') handleSaveAttempt(athleteId);
  }, [handleSaveAttempt]);

  const handleShowAudit = useCallback(async (athleteId: number, name: string) => {
    if (auditPanelAthlete?.id === athleteId) {
      setAuditPanelAthlete(null);
      return;
    }
    setAuditPanelAthlete({ id: athleteId, name });
    setAuditLoading(true);
    setAuditLog([]);
    try {
      const data = await api.getAuditLog(athleteId);
      setAuditLog(Array.isArray(data) ? data : data?.entries ?? []);
    } catch {
      setAuditLog([]);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPanelAthlete]);

  // ─── Render ───

  if (loading) {
    return (
      <BackofficeLayout>
        <div className="flex items-center justify-center min-h-[60vh]" data-ui="judge-loading">
          <Loader2 className="w-8 h-8 text-red-accent animate-spin" />
          <span className="ml-3 text-gray-400" data-ui="judge-loading-text">Cargando mesa de jueces...</span>
        </div>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8 flex flex-col lg:flex-row gap-4 lg:gap-6" data-ui="judge-table-page">
        {/* ─── Main content ─── */}
        <div className="flex-1 min-w-0" data-ui="judge-main">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5" data-ui="judge-header">
            <div data-ui="judge-header-left">
              <h1 className="text-xl xs:text-2xl font-bold text-white" data-ui="judge-title">Mesa de Jueces</h1>
              <p className="text-sm text-gray-400 mt-0.5" data-ui="judge-subtitle">Editor de intentos en tiempo real</p>
            </div>
            <div className="flex items-center gap-3" data-ui="judge-header-right">
              {/* Auto-refresh indicator */}
              <div className="flex items-center gap-2 text-xs text-gray-500" data-ui="judge-refresh-status">
                <span className="relative flex h-2 w-2" data-ui="judge-pulse-dot">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" data-ui="judge-pulse-ring" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" data-ui="judge-pulse-core" />
                </span>
                <span data-ui="judge-last-updated">
                  {lastUpdated ? `Actualizado: ${formatTime(lastUpdated.toISOString())}` : 'Conectando...'}
                </span>
              </div>
              <button onClick={fetchData}
                className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                data-ui="judge-manual-refresh-btn"
                aria-label="Refrescar">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-300 text-sm" data-ui="judge-error">
              {error}
            </div>
          )}

          {/* Category groups */}
          {sortedCategories.length === 0 && (
            <div className="text-center py-16 text-gray-500" data-ui="judge-empty">
              <p className="text-lg" data-ui="judge-empty-text">No hay intentos registrados</p>
              <p className="text-sm mt-1" data-ui="judge-empty-hint">Los datos se actualizan automaticamente cada 5 segundos</p>
            </div>
          )}

          <div className="space-y-3" data-ui="judge-categories">
            {sortedCategories.map((cat) => {
              const groupRows = groupedByCategory.get(cat) ?? [];
              const isExpanded = expandedCategories.has(cat);
              return (
                <div key={cat} className="bg-dark-surface/60 rounded-xl border border-white/5 overflow-hidden" data-ui={`judge-category-${cat}`}>
                  {/* Category header */}
                  <button onClick={() => handleToggleCategory(cat)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                    data-ui={`judge-category-${cat}-header`}>
                    <div className="flex items-center gap-2" data-ui={`judge-category-${cat}-left`}>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-gray-400" data-ui={`judge-category-${cat}-chevron-down`} />
                        : <ChevronRight className="w-4 h-4 text-gray-400" data-ui={`judge-category-${cat}-chevron-right`} />}
                      <span className="text-sm font-semibold text-white" data-ui={`judge-category-${cat}-label`}>{cat}</span>
                    </div>
                    <span className="text-xs text-gray-500" data-ui={`judge-category-${cat}-count`}>{groupRows.length} atletas</span>
                  </button>

                  {/* Athlete rows */}
                  {isExpanded && (
                    <div className="border-t border-white/5" data-ui={`judge-category-${cat}-body`}>
                      {/* Table header */}
                      <div className="hidden md:grid grid-cols-[var(--cols)] gap-2 px-4 py-2 text-xs text-gray-500 font-medium border-b border-white/5"
                        style={{ '--cols': isFer ? '1fr 100px 70px 80px' : '1fr 100px 70px 80px 140px 44px' } as React.CSSProperties}
                        data-ui={`judge-category-${cat}-table-head`}>
                        <span data-ui="judge-th-name">Atleta</span>
                        <span data-ui="judge-th-lift">Elevacion</span>
                        <span data-ui="judge-th-attempt">Intento</span>
                        <span data-ui="judge-th-weight">Peso (kg)</span>
                        {!isFer && <span data-ui="judge-th-next">Siguiente (kg)</span>}
                        {!isFer && <span data-ui="judge-th-actions" />}
                      </div>

                      {groupRows.map((row) => {
                        const isCurrent = row.athleteId === currentAthleteId;
                        const isSaving = savingIds.has(row.athleteId);
                        const editValue = editingWeights[row.athleteId] ?? '';

                        return (
                          <div key={row.athleteId}
                            className={`
                              grid grid-cols-1 md:grid-cols-[var(--cols)] gap-2 md:gap-2
                              px-4 py-2.5 border-b border-white/5 last:border-b-0
                              items-center transition-colors
                              ${isCurrent ? 'bg-yellow-500/5 border-l-2 border-l-yellow-500' : 'hover:bg-white/[0.02]'}
                            `}
                            style={{ '--cols': isFer ? '1fr 100px 70px 80px' : '1fr 100px 70px 80px 140px 44px' } as React.CSSProperties}
                            data-ui={`judge-row-${row.athleteId}`}>

                            {/* Name */}
                            <div className="flex items-center gap-2" data-ui={`judge-row-${row.athleteId}-name-col`}>
                              <button onClick={() => handleShowAudit(row.athleteId, `${row.firstName} ${row.surname}`)}
                                className="text-gray-400 hover:text-yellow-400 transition-colors"
                                data-ui={`judge-row-${row.athleteId}-audit-btn`}
                                aria-label="Ver historial">
                                <History className="w-3.5 h-3.5" />
                              </button>
                              <div data-ui={`judge-row-${row.athleteId}-name-wrap`}>
                                <span className={`text-sm font-medium ${isCurrent ? 'text-yellow-300' : 'text-white'}`} data-ui={`judge-row-${row.athleteId}-fullname`}>
                                  {row.surname}, {row.firstName}
                                </span>
                                {isCurrent && (
                                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded" data-ui={`judge-row-${row.athleteId}-badge`}>
                                    Plataforma
                                  </span>
                                )}
                                <span className="block md:inline md:ml-2 text-xs text-gray-500" data-ui={`judge-row-${row.athleteId}-cat`}>{row.weightCategory}</span>
                              </div>
                            </div>

                            {/* Current lift */}
                            <div className="md:text-center" data-ui={`judge-row-${row.athleteId}-lift-col`}>
                              {row.currentLift && (
                                <span className={`text-xs font-semibold ${LIFT_COLORS[row.currentLift]}`} data-ui={`judge-row-${row.athleteId}-lift-label`}>
                                  {LIFT_LABELS[row.currentLift]}
                                </span>
                              )}
                            </div>

                            {/* Current attempt */}
                            <div className="md:text-center" data-ui={`judge-row-${row.athleteId}-attempt-col`}>
                              <span className="text-sm text-gray-300 font-mono" data-ui={`judge-row-${row.athleteId}-attempt-num`}>
                                {row.currentAttempt > 0 ? row.currentAttempt : '-'}
                              </span>
                            </div>

                            {/* Current weight */}
                            <div className="md:text-center" data-ui={`judge-row-${row.athleteId}-weight-col`}>
                              <span className="text-sm text-white font-mono font-semibold" data-ui={`judge-row-${row.athleteId}-weight-val`}>
                                {row.currentWeight > 0 ? `${row.currentWeight}` : '-'}
                              </span>
                            </div>

                            {/* Next attempt input + save */}
                            {!isFer && (
                            <div className="flex items-center gap-2" data-ui={`judge-row-${row.athleteId}-next-col`}>
                              <span className="text-[10px] text-gray-500 md:hidden" data-ui={`judge-row-${row.athleteId}-next-label-mobile`}>
                                Siguiente ({LIFT_LABELS[row.nextLift]} #{row.nextAttempt}):
                              </span>
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => handleWeightChange(row.athleteId, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, row.athleteId)}
                                placeholder={`${row.currentWeight > 0 ? row.currentWeight : ''}`}
                                min={WEIGHT_MIN} max={WEIGHT_MAX}
                                className="w-20 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white font-mono text-center placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-accent/50 focus:border-red-accent"
                                data-ui={`judge-row-${row.athleteId}-next-input`}
                              />
                              <button onClick={() => handleSaveAttempt(row.athleteId)}
                                disabled={isSaving || !editValue || isNaN(Number(editValue)) || Number(editValue) < WEIGHT_MIN || Number(editValue) > WEIGHT_MAX}
                                className="p-1.5 text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors"
                                data-ui={`judge-row-${row.athleteId}-save-btn`}
                                aria-label="Guardar intento">
                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            )}

                            {!isFer && <div data-ui={`judge-row-${row.athleteId}-spacer`} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Audit Side Panel ─── */}
        {auditPanelAthlete && (
          <div className="w-full lg:w-80 shrink-0 bg-dark-surface/60 rounded-xl border border-white/5 overflow-hidden" data-ui="judge-audit-panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5" data-ui="judge-audit-header">
              <div data-ui="judge-audit-header-left">
                <h3 className="text-sm font-semibold text-white" data-ui="judge-audit-title">Historial de cambios</h3>
                <p className="text-xs text-gray-500 mt-0.5" data-ui="judge-audit-athlete-name">{auditPanelAthlete.name}</p>
              </div>
              <button onClick={() => setAuditPanelAthlete(null)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                data-ui="judge-audit-close-btn"
                aria-label="Cerrar panel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] lg:max-h-[calc(100vh-12rem)] overflow-y-auto" data-ui="judge-audit-body">
              {auditLoading && (
                <div className="flex items-center justify-center py-8" data-ui="judge-audit-loading">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-400" data-ui="judge-audit-loading-text">Cargando...</span>
                </div>
              )}

              {!auditLoading && auditLog.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm" data-ui="judge-audit-empty">
                  Sin cambios registrados
                </div>
              )}

              {!auditLoading && auditLog.length > 0 && (
                <div className="divide-y divide-white/5" data-ui="judge-audit-list">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="px-4 py-2.5" data-ui={`judge-audit-entry-${entry.id}`}>
                      <div className="flex items-center justify-between" data-ui={`judge-audit-entry-${entry.id}-top`}>
                        <span className={`text-xs font-semibold ${LIFT_COLORS[entry.liftType as LiftType] ?? 'text-gray-300'}`} data-ui={`judge-audit-entry-${entry.id}-lift`}>
                          {entry.liftType} #{entry.attemptNumber}
                        </span>
                        <span className="text-[10px] text-gray-500 flex items-center gap-1" data-ui={`judge-audit-entry-${entry.id}-time`}>
                          <Clock className="w-3 h-3" />
                          {formatTime(entry.changedAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-400" data-ui={`judge-audit-entry-${entry.id}-detail`}>
                        {entry.oldWeight != null ? (
                          <span data-ui={`judge-audit-entry-${entry.id}-change`}>
                            <span className="line-through text-gray-600" data-ui={`judge-audit-entry-${entry.id}-old`}>{entry.oldWeight} kg</span>
                            {' -> '}
                            <span className="text-white font-medium" data-ui={`judge-audit-entry-${entry.id}-new`}>{entry.newWeight} kg</span>
                          </span>
                        ) : (
                          <span className="text-white font-medium" data-ui={`judge-audit-entry-${entry.id}-set`}>Establecido: {entry.newWeight} kg</span>
                        )}
                        {entry.changedBy && (
                          <span className="text-gray-600 ml-1" data-ui={`judge-audit-entry-${entry.id}-by`}>por {entry.changedBy}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}
