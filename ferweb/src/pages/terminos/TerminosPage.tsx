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
      'La competición FER CUP II 2026 es organizada y gestionada íntegramente por GR Strength Club (en adelante, «el Club» o «el Organizador»), con sede en Valencia, Valencia. FER Entrenamiento actúa únicamente como el gimnasio anfitrión que cede sus instalaciones para la celebración del evento, sin asumir responsabilidad alguna en la organización, gestión, inscripciones, cobros o desarrollo de la competición.',
  },
  {
    title: '2. Aceptación de los términos',
    content:
      'La inscripción y participación en el FER CUP II 2026 implica la aceptación plena y sin reservas de los presentes términos y condiciones. Si el participante no está de acuerdo con alguna de las cláusulas aquí recogidas, deberá abstenerse de inscribirse o participar en el evento.',
  },
  {
    title: '3. Requisitos de participación',
    content:
      'Podrán participar todas las personas mayores de 14 años que completen el proceso de inscripción y abonen la tarifa correspondiente. Los participantes menores de edad deberán presentar una autorización firmada por su tutor o tutora legal. Es responsabilidad del participante asegurarse de que su estado de salud le permite realizar esfuerzos físicos intensos propios del powerlifting. El Organizador se reserva el derecho de admisión.',
  },
  {
    title: '4. Proceso de inscripción y pago',
    content:
      'Las inscripciones se realizarán exclusivamente a través de la web oficial del evento. El pago se efectuará mediante Stripe (tarjeta de crédito o débito) en el momento de la inscripción. El precio de la inscripción incluye: participación en la competición, camiseta oficial del evento y acceso a las instalaciones durante la jornada. No se incluyen gastos de desplazamiento, alojamiento ni manutención.',
  },
  {
    title: '5. Cancelaciones y devoluciones',
    content:
      'Las cancelaciones deberán comunicarse por escrito a la dirección de correo electrónico que el Organizador determine. Se aplicará la siguiente política de devoluciones:\n\n• Cancelación con más de 30 días de antelación: devolución del 100 % del importe.\n• Cancelación entre 15 y 30 días de antelación: devolución del 50 % del importe.\n• Cancelación con menos de 15 días de antelación: no se realizará devolución.\n\nEl Organizador se reserva el derecho de cancelar o aplazar el evento por causas de fuerza mayor. En tal caso, se ofrecerá a los inscritos la opción de transferir su plaza a la nueva fecha o recibir el reembolso íntegro.',
  },
  {
    title: '6. Categorías y peso',
    content:
      'Los participantes serán clasificados en categorías según su sexo, edad y peso corporal, conforme al reglamento de la competición. El pesaje se realizará el día del evento en el horario y lugar indicados. El participante que no se presente al pesaje en la franja horaria asignada quedará automáticamente descalificado.',
  },
  {
    title: '7. Normativa de competición',
    content:
      'La competición se regirá por el reglamento oficial de powerlifting adaptado para el evento. Todos los participantes se comprometen a cumplir las normas establecidas y a seguir las indicaciones de los jueces y el personal de la organización. El uso de sustancias dopantes está terminantemente prohibido. El Organizador se reserva el derecho de descalificar a cualquier participante que incumpla la normativa.',
  },
  {
    title: '8. Limitación de responsabilidad',
    content:
      'La participación en el FER CUP II 2026 implica la asunción de los riesgos inherentes a la práctica del powerlifting. El Organizador dispondrá de los medios de seguridad y asistencia básicos; no obstante, no se hace responsable de lesiones, daños personales o pérdidas materiales que pudieran ocurrir durante el desarrollo del evento, salvo en los casos en que la ley establezca lo contrario. Se recomienda a todos los participantes disponer de un seguro deportivo o de accidentes propio.',
  },
  {
    title: '9. Derechos de imagen',
    content:
      'Al inscribirse, el participante autoriza al Organizador a captar, reproducir y difundir imágenes y vídeos del evento en los que pudiera aparecer, con fines promocionales y de difusión del FER CUP y del Club, en cualquier medio o soporte (web, redes sociales, prensa, etc.), sin que ello genere derecho a compensación económica alguna. Quien desee oponerse a la utilización de su imagen deberá comunicarlo por escrito al Organizador antes del inicio del evento.',
  },
  {
    title: '10. Modificaciones',
    content:
      'El Organizador se reserva el derecho de modificar los presentes términos y condiciones en cualquier momento, notificando los cambios a través de la web oficial. La participación en el evento después de la publicación de las modificaciones implicará la aceptación de las mismas.',
  },
  {
    title: '11. Legislación aplicable y jurisdicción',
    content:
      'Los presentes términos y condiciones se rigen por la legislación española. Cualquier controversia que pudiera derivarse de la interpretación o ejecución de estos términos será sometida a los juzgados y tribunales de Valencia, con renuncia expresa a cualquier otro fuero que pudiera corresponder.',
  },
  {
    title: '12. Contacto',
    content:
      'Para cualquier consulta relacionada con estos términos y condiciones, puedes escribirnos a la dirección de correo electrónico que el Organizador indique en la web oficial o contactar a través de nuestras redes sociales.',
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
