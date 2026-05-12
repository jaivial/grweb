import { useEffect, useMemo, useCallback } from 'react';
import type { JSX } from 'react';
import { CardGrid, SectionCard } from '../../components/ui';
import { KpiCard } from '../../components/ui/KpiCard/KpiCard';
import { useSignalR } from '../../hooks/useSignalR';
import { participantCount } from '../../stores/participants';
import { useAtomValue } from 'jotai';
import { currentCompeticionIdAtom, isCurrentFerAtom } from '../../stores/auth.atoms';
import { useInscripciones } from '../../hooks/useInscripciones';
import { useCompeticionSlug } from '../../hooks/useCompeticionSlug';
import { Settings, QrCode } from 'lucide-react';

interface SectionConfig {
  title: string;
  description: string;
  subPath: string;
  icon: JSX.Element;
  ferOnly?: boolean;
  grcupOnly?: boolean;
}

const UsersIcon = (
  <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const TicketIcon = (
  <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
);

const DiceIcon = (
  <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CalendarIcon = (
  <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// Note: subPath is relative to /backoffice/:competicionSlug/
const allSections: SectionConfig[] = [
  {
    title: 'Inscripciones',
    description: 'Gestiona los atletas registrados y filtra por categoria',
    subPath: 'inscripciones',
    icon: UsersIcon,
  },
  {
    title: 'Lector QR',
    description: 'Escanea codigos QR para check-in de atletas',
    subPath: 'qr-reader',
    icon: <QrCode className="w-5 h-5 xs:w-6 xs:h-6" />,
    ferOnly: true,
  },
  {
    title: 'Participantes',
    description: 'Administra las entradas del sorteo y exporta datos en CSV',
    subPath: 'participantes',
    icon: TicketIcon,
    grcupOnly: true,
  },
  {
    title: 'Sorteo',
    description: 'Realiza el sorteo de ganadores entre los participantes',
    subPath: 'sorteo',
    icon: DiceIcon,
    grcupOnly: true,
  },
  {
    title: 'Horarios',
    description: 'Configura los horarios de las categorias por dia',
    subPath: 'horarios',
    icon: CalendarIcon,
  },
  {
    title: 'Configuracion General',
    description: 'Configura el sistema de email para envios automaticos',
    subPath: 'configuracion',
    icon: <Settings className="w-5 h-5 xs:w-6 xs:h-6" />,
  },
];

export function BackofficeHome(): JSX.Element {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const isFER = useAtomValue(isCurrentFerAtom);
  const { buildPath } = useCompeticionSlug();
  const { stats, loadStats, isLoading } = useInscripciones(competicionId || 0);

  useSignalR();

  useEffect(() => {
    if (competicionId) {
      loadStats();
    }
  }, [competicionId, loadStats]);

  const sections = useMemo(
    () => allSections.filter((s) => {
      if (s.ferOnly && !isFER) return false;
      if (s.grcupOnly && isFER) return false;
      return true;
    }),
    [isFER],
  );

  const subtitle = useMemo(
    () => isFER
      ? 'Gestiona las inscripciones, check-in y horarios de FER'
      : 'Gestiona las inscripciones, sorteos y horarios del GR Cup',
    [isFER],
  );

  const kpis = useMemo(() => {
    const total = stats?.total ?? participantCount.value ?? 0;
    const pagados = stats?.pagados ?? 0;
    const revenue = stats?.revenue ?? 0;
    return [
      {
        label: isFER ? 'Inscritos' : 'Participantes',
        value: total,
        color: 'default' as const,
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        label: 'Pagados',
        value: pagados,
        color: 'success' as const,
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        label: 'Recaudacion',
        value: revenue > 0 ? `${revenue.toFixed(0)} EUR` : '0 EUR',
        color: 'warning' as const,
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ];
  }, [stats, isFER]);

  // Build sections with full hrefs using the current slug
  const sectionsWithHrefs = useMemo(
    () => sections.map((s) => ({ ...s, href: buildPath(s.subPath) })),
    [sections, buildPath],
  );

  return (
    <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="backoffice-home">
      <div className="mb-6 xs:mb-8" data-ui="home-header">
        <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2" data-ui="home-title">
          Panel de Administracion
        </h1>
        <p className="text-sm xs:text-base text-gray-400" data-ui="home-subtitle">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 sm2:grid-cols-2 md:grid-cols-3 gap-3 xs:gap-4 mb-6 xs:mb-8" data-ui="kpi-row">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            color={kpi.color}
            icon={kpi.icon}
          />
        ))}
      </div>

      <CardGrid columns={4}>
        {sectionsWithHrefs.map((section) => (
          <SectionCard
            key={section.subPath}
            title={section.title}
            description={section.description}
            href={section.href}
            icon={section.icon}
          />
        ))}
      </CardGrid>

      <div className="mt-6 xs:mt-8 flex flex-wrap gap-2 xs:gap-3" data-ui="quick-actions">
        <button
          onClick={loadStats}
          className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
          data-ui="refresh-btn"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      <div className="mt-6 xs:mt-8 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 gap-4 xs:gap-6" data-ui="info-cards">
        <div className="p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="info-how">
          <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2" data-ui="info-how-title">
            <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-how-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Como funciona
          </h3>
          <div className="space-y-2 text-gray-400 text-sm" data-ui="info-how-list">
            {isFER ? (
              <>
                <p data-ui="info-how-inscription">Los atletas se inscriben online y confirman pago</p>
                <p data-ui="info-how-checkin">Usa el Lector QR para hacer check-in el dia del evento</p>
                <p data-ui="info-how-schedule">Configura horarios por categoria y dia</p>
              </>
            ) : (
              <>
                <p data-ui="info-how-price">Cada ticket cuesta <span className="text-white font-semibold" data-ui="info-how-price-value">0.50 EUR</span></p>
                <p data-ui="info-how-multiple">Los participantes pueden comprar multiples tickets</p>
                <p data-ui="info-how-winner">El ganador se selecciona aleatoriamente (ponderado por tickets)</p>
              </>
            )}
            <p data-ui="info-how-realtime">Actualizaciones en tiempo real via SignalR</p>
          </div>
        </div>
        <div className="p-5 bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl" data-ui="info-security">
          <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2" data-ui="info-security-title">
            <svg className="w-4 h-4 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="info-security-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Seguridad
          </h3>
          <div className="space-y-2 text-gray-400 text-sm" data-ui="info-security-list">
            <p data-ui="info-security-jwt">Todas las rutas admin estan protegidas por JWT</p>
            <p data-ui="info-security-sessions">Las sesiones expiran despues de 24 horas</p>
            <p data-ui="info-security-audit">Todos los sorteos quedan registrados con timestamps</p>
            <p data-ui="info-security-creds">Cambiar credenciales por defecto en produccion</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BackofficeHome;
