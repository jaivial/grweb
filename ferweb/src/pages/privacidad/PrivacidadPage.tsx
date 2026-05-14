import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { FER_COLORS, FER_EVENT } from '../fer/constants';
import { Head } from '../../components/Head';
import { FerFooter } from '../fer/components/FerFooter';

const SECTIONS = [
  {
    title: '1. Responsable del tratamiento',
    content:
      'El responsable del tratamiento de los datos personales recogidos a través de esta web es GR Strength Club (en adelante, «el Club» o «el Responsable»), con sede en Valencia, Valencia. FER Entrenamiento actúa únicamente como gimnasio anfitrión del evento y no participa en la recogida, tratamiento o gestión de los datos personales de los participantes.',
  },
  {
    title: '2. Datos recopilados',
    content:
      'Durante el proceso de inscripción y navegación por la web, podemos recopilar las siguientes categorías de datos:\n\n• Datos identificativos: nombre, apellidos, fecha de nacimiento, DNI/NIE.\n• Datos de contacto: dirección de correo electrónico, número de teléfono.\n• Datos de participación: categoría, peso corporal, experiencia previa, club al que pertenece (si procede).\n• Datos de pago: se procesan exclusivamente a través de Stripe. El Club no almacena números de tarjeta ni datos bancarios.\n• Datos de navegación: dirección IP, tipo de navegador, páginas visitadas (mediante cookies analíticas).',
  },
  {
    title: '3. Finalidad del tratamiento',
    content:
      'Los datos personales recogidos serán tratados con las siguientes finalidades:\n\n• Gestionar la inscripción y participación en el FER CUP II 2026.\n• Procesar el pago de la inscripción a través de Stripe.\n• Comunicar información relevante sobre el evento (horarios, cambios de última hora, resultados).\n• Publicar clasificaciones y resultados oficiales de la competición.\n• Difundir imágenes y vídeos del evento con fines promocionales (según lo establecido en los términos y condiciones).\n• Mejorar la experiencia de navegación en la web mediante cookies analíticas.',
  },
  {
    title: '4. Base legal del tratamiento',
    content:
      'El tratamiento de sus datos se basa en las siguientes bases legales:\n\n• Ejecución de un contrato: la inscripción en el evento constituye una relación contractual entre el participante y el Organizador.\n• Consentimiento del interesado: para la difusión de imágenes y vídeos con fines promocionales, y para el uso de cookies no esenciales.\n• Interés legítimo: para la publicación de clasificaciones y resultados.\n• Cumplimiento de obligaciones legales: cuando sea requerido por la normativa aplicable.',
  },
  {
    title: '5. Plazo de conservación',
    content:
      'Los datos personales se conservarán durante el tiempo necesario para cumplir con las finalidades descritas y, en todo caso, durante los plazos legalmente establecidos. Una vez finalizada la competición, los datos se mantendrán durante un plazo máximo de cinco años por motivos fiscales y legales, salvo que el interesado ejerza su derecho de supresión antes de dicho plazo.',
  },
  {
    title: '6. Destinatarios de los datos',
    content:
      'Los datos personales no serán cedidos a terceros salvo en los siguientes casos:\n\n• Stripe, como plataforma de procesamiento de pagos (consulta su política de privacidad en stripe.com/privacy).\n• Autoridades públicas y administrativas, cuando lo exija la legislación vigente.\n• Prestadores de servicios tecnológicos (alojamiento web, correo electrónico) que actúan como encargados del tratamiento y están sujetos a las garantías contractuales exigidas por el RGPD.\n\nNo se realizan transferencias internacionales de datos fuera del Espacio Económico Europeo (EEE), salvo las inherentes a los servicios de Stripe, que garantizan un nivel adecuado de protección mediante cláusulas contractuales tipo.',
  },
  {
    title: '7. Derechos del usuario',
    content:
      'El interesado puede ejercer en cualquier momento los siguientes derechos reconocidos por el Reglamento General de Protección de Datos (RGPD):\n\n• Derecho de acceso: saber qué datos tratamos y para qué.\n• Derecho de rectificación: solicitar la corrección de datos inexactos.\n• Derecho de supresión («derecho al olvido»): solicitar la eliminación de sus datos.\n• Derecho a la limitación del tratamiento: solicitar que se restrinja el tratamiento de sus datos.\n• Derecho a la portabilidad: recibir sus datos en un formato estructurado y legible.\n• Derecho de oposición: oponerse al tratamiento de sus datos para fines concretos.\n\nPara ejercer estos derechos, debe enviar una solicitud por escrito a la dirección de correo electrónico que el Organizador indique en la web oficial, indicando el derecho que desea ejercer y adjuntando una copia de su DNI o documento identificativo.',
  },
  {
    title: '8. Seguridad de los datos',
    content:
      'El Club ha adoptado las medidas técnicas y organizativas necesarias para garantizar la seguridad e integridad de los datos personales, y para evitar su pérdida, alteración, acceso no autorizado o divulgación, de acuerdo con el estado de la tecnología y la naturaleza de los datos almacenados.',
  },
  {
    title: '9. Cookies',
    content:
      'Este sitio web utiliza cookies propias y de terceros para mejorar la experiencia de navegación y recopilar información estadística anónima. Puede configurar o rechazar las cookies en cualquier momento a través de la configuración de su navegador. Para más información, consulte nuestra política de cookies.',
  },
  {
    title: '10. Reclamaciones',
    content:
      'Si considera que el tratamiento de sus datos personales infringe la normativa de protección de datos, puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) a través de su sede electrónica (www.aepd.es).',
  },
  {
    title: '11. Modificaciones',
    content:
      'El Club se reserva el derecho de modificar la presente política de privacidad para adaptarla a novedades legislativas, jurisprudenciales o de interpretación de la Agencia Española de Protección de Datos. Los cambios serán notificados a través de la web oficial.',
  },
  {
    title: '12. Contacto',
    content:
      'Para cualquier consulta relacionada con la protección de datos personales, puede escribirnos a la dirección de correo electrónico que el Organizador indique en la web oficial, indicando en el asunto «Protección de Datos».',
  },
];

export function PrivacidadPage() {
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
        title="Política de Privacidad | FER CUP"
        description="Política de privacidad del FER CUP II 2026. Conoce cómo GR Strength Club trata tus datos personales conforme al RGPD."
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="privacidad-page"
      >
        {/* Page hero / breadcrumb bar */}
        <header
          className="relative overflow-hidden"
          style={{
            backgroundColor: FER_COLORS.bgDark,
            borderBottom: `1px solid ${FER_COLORS.accent}15`,
          }}
          data-ui="privacidad-page-header"
        >
          {/* Subtle glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 100%, ${FER_COLORS.gold}08 0%, transparent 60%)`,
            }}
            aria-hidden="true"
            data-ui="privacidad-page-header-glow"
          />

          <div
            className="max-w-6xl mx-auto px-4 pt-6 pb-4 relative z-10"
            data-ui="privacidad-page-header-content"
          >
            {/* Breadcrumb / back link */}
            <motion.nav
              variants={breadcrumbVariants}
              initial="hidden"
              animate="visible"
              className="mb-4"
              data-ui="privacidad-page-breadcrumb"
            >
              <a
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium group"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="privacidad-page-back-link"
              >
                <ArrowLeft
                  size={16}
                  className="transition-transform duration-200 group-hover:-translate-x-1"
                  data-ui="privacidad-page-back-icon"
                />
                <span data-ui="privacidad-page-back-text">Volver al inicio</span>
              </a>
            </motion.nav>

            {/* Page title */}
            <motion.div
              variants={heroVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-3"
              data-ui="privacidad-page-title-row"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${FER_COLORS.gold}10`,
                  border: `1px solid ${FER_COLORS.gold}20`,
                  boxShadow: `0 0 20px ${FER_COLORS.gold}10`,
                }}
                data-ui="privacidad-page-title-icon-bg"
              >
                <Shield
                  size={20}
                  style={{ color: FER_COLORS.gold }}
                  data-ui="privacidad-page-title-icon"
                />
              </div>
              <div data-ui="privacidad-page-title-text-group">
                <h1
                  className="text-2xl sm:text-3xl font-display font-bold"
                  style={{ color: FER_COLORS.text }}
                  data-ui="privacidad-page-title"
                >
                  Política de{' '}
                  <span style={{ color: FER_COLORS.gold }} data-ui="privacidad-page-title-highlight">
                    Privacidad
                  </span>
                </h1>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: FER_COLORS.textMuted }}
                  data-ui="privacidad-page-subtitle"
                >
                  {FER_EVENT.name}
                </p>
              </div>
            </motion.div>
          </div>
        </header>

        <main className="flex-1" data-ui="privacidad-page-main">
          {/* Last updated notice */}
          <section
            className="max-w-4xl mx-auto px-4 pt-10 pb-2"
            data-ui="privacidad-page-version"
          >
            <p
              className="text-xs sm:text-sm"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="privacidad-page-version-text"
            >
              Última actualización: mayo de 2026
            </p>
          </section>

          {/* Content sections */}
          <section
            className="max-w-4xl mx-auto px-4 py-6 pb-16"
            data-ui="privacidad-page-content"
          >
            <div className="space-y-10" data-ui="privacidad-page-sections">
              {SECTIONS.map((section, index) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.4, delay: index * 0.04 }}
                  data-ui={`privacidad-section-${index + 1}`}
                >
                  <h2
                    className="text-lg sm:text-xl font-display font-semibold mb-3"
                    style={{ color: FER_COLORS.gold }}
                    data-ui={`privacidad-section-title-${index + 1}`}
                  >
                    {section.title}
                  </h2>
                  <div
                    className="text-sm sm:text-base leading-relaxed whitespace-pre-line"
                    style={{ color: FER_COLORS.textMuted }}
                    data-ui={`privacidad-section-body-${index + 1}`}
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
                      data-ui={`privacidad-section-divider-${index + 1}`}
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

export default PrivacidadPage;
