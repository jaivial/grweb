import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, ArrowLeft } from 'lucide-react';
import { FER_COLORS, FER_EVENT } from '../fer/constants';
import { Head } from '../../components/Head';
import { FerFooter } from '../fer/components/FerFooter';

const SECTIONS = [
  {
    title: '1. Identificación del organizador',
    content:
      'La FER CUP es un evento organizado y gestionado íntegramente por:\n\nGRUPO DE RECREACIÓN DEPORTIVA DE HALTEROFILIA GR STRENGTH TORRENT VALENCIA\nNIF: G24770950\nDomicilio social: Calle Paralelo, nº2, Bloque A, Puerta 3, 46440 Almussafes (Valencia)\n\n(en adelante, «GR Strength» o «el Organizador»).\n\nLa competición se celebrará en el Pabellón Municipal de Almussafes (Valencia).\n\nFER Entrenamiento actúa exclusivamente como entidad colaboradora y gimnasio asociado al evento, sin intervenir en la organización administrativa, gestión de inscripciones o desarrollo operativo de la competición.',
  },
  {
    title: '2. Aceptación de las condiciones',
    content:
      'La inscripción y participación en la FER CUP implica la aceptación plena y sin reservas de los presentes términos y condiciones.\n\nEn caso de no estar de acuerdo con cualquiera de las disposiciones recogidas en este documento, el participante deberá abstenerse de formalizar su inscripción o participar en el evento.',
  },
  {
    title: '3. Requisitos de participación',
    content:
      'Podrán participar todas las personas mayores de 14 años que completen correctamente el proceso de inscripción.\n\nLos participantes menores de edad deberán aportar autorización firmada por su padre, madre o tutor legal.\n\nCada participante declara encontrarse en condiciones físicas adecuadas para la práctica del powerlifting y asume voluntariamente los riesgos inherentes a este tipo de actividad deportiva.\n\nEl Organizador se reserva el derecho de admisión y podrá rechazar o cancelar cualquier inscripción cuando existan motivos razonables para ello.',
  },
  {
    title: '4. Inscripción y participación',
    content:
      'Las inscripciones se realizarán exclusivamente a través de la web oficial del evento.\n\nLa plaza quedará reservada únicamente tras completar correctamente el formulario de inscripción y seguir las instrucciones indicadas por la organización.\n\nLa inscripción incluye:\n• Participación en la competición\n• Acceso a las instalaciones durante el evento\n• Servicios y recursos incluidos por la organización según disponibilidad\n\nLos gastos de desplazamiento, alojamiento, manutención o cualquier otro coste externo correrán a cargo del participante.',
  },
  {
    title: '5. Cancelaciones y modificaciones',
    content:
      'Las solicitudes de cancelación deberán comunicarse por escrito a través del correo electrónico indicado por la organización.\n\nEl Organizador se reserva el derecho de modificar horarios, categorías, estructura del evento o cualquier aspecto organizativo cuando resulte necesario para el correcto funcionamiento de la competición.\n\nAsimismo, GR Strength podrá cancelar, aplazar o reprogramar el evento por causas organizativas, técnicas, sanitarias o de fuerza mayor.\n\nEn dichos supuestos, se comunicará oportunamente a los participantes la solución adoptada.',
  },
  {
    title: '6. Categorías y pesaje',
    content:
      'Los participantes serán distribuidos en categorías conforme a los criterios establecidos por la organización.\n\nEl pesaje se realizará en el horario y lugar previamente comunicados a través de los canales oficiales del evento.\n\nLa nocomparecencia dentro de la franja horaria asignada podrá implicar la descalificación o reubicación del participante, según determine la organización.',
  },
  {
    title: '7. Normativa de competición',
    content:
      'La FER CUP seguirá un reglamento interno inspirado en las competiciones oficiales de powerlifting, adaptado al formato y filosofía del evento.\n\nTodos los participantes deberán:\n• Respetar las indicaciones de jueces y organización\n• Mantener una conducta deportiva adecuada\n• Cumplir las normas de seguridad y funcionamiento\n\nEl Organizador podrá descalificar a cualquier participante que:\n• incumpla las normas del evento\n• actúe de forma antideportiva\n• ponga en riesgo la seguridad del resto de asistentes',
  },
  {
    title: '8. Exención y limitación de responsabilidad',
    content:
      'La participación en la FER CUP implica la aceptación de los riesgos inherentes a la práctica del powerlifting y del entrenamiento de fuerza.\n\nEl Organizador adoptará las medidas razonables de seguridad y coordinación necesarias para el correcto desarrollo del evento; no obstante, no será responsable de lesiones, daños físicos, pérdidas materiales o incidencias derivadas de la participación, salvo en aquellos casos legalmente exigibles.\n\nSe recomienda a todos los participantes disponer de seguro deportivo o cobertura médica adecuada.',
  },
  {
    title: '9. Derechos de imagen',
    content:
      'La participación en la FER CUP implica la autorización para la captación y utilización de fotografías y vídeos realizados durante el evento.\n\nGR Strength podrá utilizar dicho contenido con fines:\n• promocionales\n• publicitarios\n• informativos\n• audiovisuales y de comunicación\n\nen cualquier soporte físico o digital relacionado con el evento, el club o futuros proyectos deportivos.\n\nQuienes deseen limitar el uso de su imagen deberán comunicarlo previamente por escrito a la organización antes del inicio del evento.',
  },
  {
    title: '10. Modificaciones de las condiciones',
    content:
      'GR Strength se reserva el derecho de modificar los presentes términos y condiciones cuando resulte necesario por motivos organizativos, legales o técnicos.\n\nLas modificaciones relevantes serán comunicadas a través de los canales oficiales del evento.',
  },
  {
    title: '11. Legislación aplicable y jurisdicción',
    content:
      'Los presentes términos y condiciones se regirán por la legislación española.\n\nCualquier conflicto o controversia relacionado con la interpretación o aplicación de estas condiciones será sometido a los juzgados y tribunales de Valencia, salvo disposición legal imperativa en contrario.',
  },
  {
    title: '12. Contacto',
    content:
      'Para cualquier consulta relacionada con la FER CUP o con los presentes términos y condiciones, puede contactar con la organización a través del correo electrónico o canales oficiales indicados en la web del evento.',
  },
];

export function TerminosPage() {
  const heroVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: 'easeOut' },
      },
    }),
    []
  );

  const breadcrumbVariants = useMemo(
    () => ({
      hidden: { opacity: 0, x: -12 },
      visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.4, ease: 'easeOut', delay: 0.1 },
      },
    }),
    []
  );

  return (
    <>
      <Head
        title="Términos y Condiciones | FER CUP"
        description="Términos y condiciones de participación en el FER CUP II 2026, organizado por GR Strength Club en Valencia."
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="terminos-page"
      >
        {/* Page hero / breadcrumb bar */}
        <header
          className="relative overflow-hidden"
          style={{
            backgroundColor: FER_COLORS.bgDark,
            borderBottom: `1px solid ${FER_COLORS.accent}15`,
          }}
          data-ui="terminos-page-header"
        >
          {/* Subtle glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 100%, ${FER_COLORS.gold}08 0%, transparent 60%)`,
            }}
            aria-hidden="true"
            data-ui="terminos-page-header-glow"
          />

          <div
            className="max-w-6xl mx-auto px-4 pt-6 pb-4 relative z-10"
            data-ui="terminos-page-header-content"
          >
            {/* Breadcrumb / back link */}
            <motion.nav
              variants={breadcrumbVariants}
              initial="hidden"
              animate="visible"
              className="mb-4"
              data-ui="terminos-page-breadcrumb"
            >
              <a
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium group"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="terminos-page-back-link"
              >
                <ArrowLeft
                  size={16}
                  className="transition-transform duration-200 group-hover:-translate-x-1"
                  data-ui="terminos-page-back-icon"
                />
                <span data-ui="terminos-page-back-text">Volver al inicio</span>
              </a>
            </motion.nav>

            {/* Page title */}
            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-3"
              data-ui="terminos-page-title-row"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${FER_COLORS.gold}10`,
                  border: `1px solid ${FER_COLORS.gold}20`,
                  boxShadow: `0 0 20px ${FER_COLORS.gold}10`,
                }}
                data-ui="terminos-page-title-icon-bg"
              >
                <FileText
                  size={20}
                  style={{ color: FER_COLORS.gold }}
                  data-ui="terminos-page-title-icon"
                />
              </div>
              <div data-ui="terminos-page-title-text-group">
                <h1
                  className="text-2xl sm:text-3xl font-display font-bold"
                  style={{ color: FER_COLORS.text }}
                  data-ui="terminos-page-title"
                >
                  Términos y{' '}
                  <span style={{ color: FER_COLORS.gold }} data-ui="terminos-page-title-highlight">
                    Condiciones
                  </span>
                </h1>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui="terminos-page-subtitle"
                >
                  {FER_EVENT.name}
                </p>
              </div>
            </motion.div>
          </div>
        </header>

        <main className="flex-1" data-ui="terminos-page-main">
          {/* Last updated notice */}
          <section
            className="max-w-4xl mx-auto px-4 pt-10 pb-2"
            data-ui="terminos-page-version"
          >
            <p
              className="text-xs sm:text-sm"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="terminos-page-version-text"
            >
              Última actualización: mayo de 2026
            </p>
          </section>

          {/* Content sections */}
          <section
            className="max-w-4xl mx-auto px-4 py-6 pb-16"
            data-ui="terminos-page-content"
          >
            <div className="space-y-10" data-ui="terminos-page-sections">
              {SECTIONS.map((section, index) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.4, delay: index * 0.04 }}
                  data-ui={`terminos-section-${index + 1}`}
                >
                  <h2
                    className="text-lg sm:text-xl font-display font-semibold mb-3"
                    style={{ color: FER_COLORS.gold }}
                    data-ui={`terminos-section-title-${index + 1}`}
                  >
                    {section.title}
                  </h2>
                  <div
                    className="text-sm sm:text-base leading-relaxed whitespace-pre-line"
                    style={{ color: FER_COLORS.textMuted }}
                    data-ui={`terminos-section-body-${index + 1}`}
                  >
                    {section.content}
                  </div>
                  {index < SECTIONS.length - 1 && (
                    <div
                      className="mt-6"
                      style={{
                        height: '1px',
                        background: `linear-gradient(90deg, ${FER_COLORS.accent}20, transparent)`,
                      }}
                      data-ui={`terminos-section-divider-${index + 1}`}
                      aria-hidden="true"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        </main>

        <FerFooter />
      </div>
    </>
  );
}

export default TerminosPage;
