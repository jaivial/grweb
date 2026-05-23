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
      'El responsable del tratamiento de los datos personales recogidos a través de esta página web es:\n\nGRUPO DE RECREACIÓN DEPORTIVA DE HALTEROFILIA GR STRENGTH TORRENT VALENCIA\nNIF: G24770950\nDomicilio social: Calle Paralelo, nº2, Bloque A, Puerta 3, 46440 Almussafes (Valencia)\n\n(en adelante, «GR Strength» o «el Organizador»).\n\nLa FER CUP se celebrará en el Pabellón Municipal de Almussafes (Valencia).\n\nFER Entrenamiento actúa exclusivamente como entidad colaboradora y gimnasio asociado al evento, sin intervenir en la gestión, almacenamiento o tratamiento de los datos personales de los participantes.',
  },
  {
    title: '2. Datos personales recopilados',
    content:
      'Durante el proceso de inscripción y navegación por la web, podremos recopilar las siguientes categorías de datos:\n\n• Datos identificativos: nombre, apellidos, fecha de nacimiento y DNI/NIE.\n• Datos de contacto: correo electrónico y número de teléfono.\n• Datos relacionados con la competición: categoría, peso corporal, experiencia previa y club al que pertenece el participante, en caso de existir.\n• Datos de navegación: dirección IP, navegador utilizado y comportamiento de navegación mediante cookies analíticas.\n\nGR Strength no recopila ni almacena datos bancarios o números de tarjeta.',
  },
  {
    title: '3. Finalidad del tratamiento',
    content:
      'Los datos personales serán tratados con las siguientes finalidades:\n\n• Gestionar la inscripción y participación en la FER CUP.\n• Organizar horarios, categorías, listados y funcionamiento general del evento.\n• Contactar con los participantes para comunicar información relevante relacionada con la competición.\n• Publicar clasificaciones, resultados y listados oficiales derivados del evento.\n• Difundir imágenes y vídeos captados durante la competición con fines promocionales, publicitarios y de comunicación relacionados con GR Strength y futuros eventos.\n• Mejorar la experiencia de navegación y el funcionamiento de la web mediante herramientas analíticas.',
  },
  {
    title: '4. Base legal del tratamiento',
    content:
      'El tratamiento de los datos personales se fundamenta en:\n\n• La ejecución de la relación contractual derivada de la inscripción en el evento.\n• El consentimiento del interesado para el uso de cookies no esenciales y la difusión de imágenes o vídeos con fines promocionales.\n• El interés legítimo del Organizador para la publicación de clasificaciones y resultados deportivos.\n• El cumplimiento de obligaciones legales aplicables.',
  },
  {
    title: '5. Conservación de los datos',
    content:
      'Los datos personales se conservarán únicamente durante el tiempo necesario para cumplir con las finalidades descritas anteriormente y, posteriormente, durante los plazos legalmente exigidos.\n\nCon carácter general, los datos podrán conservarse durante un máximo de cinco años por motivos administrativos, legales o fiscales, salvo que el interesado solicite previamente su supresión cuando ello sea legalmente posible.',
  },
  {
    title: '6. Destinatarios de los datos',
    content:
      'Los datos personales no serán cedidos a terceros salvo en los siguientes supuestos:\n\n• Cuando exista obligación legal.\n• A proveedores tecnológicos necesarios para el funcionamiento de la web o la gestión de comunicaciones, actuando siempre bajo contrato y conforme al Reglamento General de Protección de Datos (RGPD).\n• A autoridades públicas o administrativas cuando resulte legalmente exigible.\n\nNo se realizarán transferencias internacionales de datos fuera del Espacio Económico Europeo (EEE), salvo aquellas derivadas del uso de herramientas tecnológicas que cumplan con las garantías exigidas por la normativa europea vigente.',
  },
  {
    title: '7. Derechos del usuario',
    content:
      'El usuario podrá ejercer en cualquier momento los siguientes derechos:\n\n• Acceso a sus datos personales.\n• Rectificación de datos inexactos o incompletos.\n• Supresión de sus datos personales.\n• Limitación del tratamiento.\n• Oposición al tratamiento.\n• Portabilidad de los datos.\n\nPara ejercer cualquiera de estos derechos, deberá enviar una solicitud a la dirección de correo electrónico indicada en la web oficial, adjuntando copia de un documento identificativo válido.',
  },
  {
    title: '8. Uso de imágenes y contenido audiovisual',
    content:
      'La participación en el evento implica la posible captación de fotografías y vídeos durante el desarrollo de la competición.\n\nDicho contenido podrá ser utilizado por GR Strength con fines promocionales, informativos y publicitarios en:\n• Redes sociales\n• Página web\n• Material gráfico o audiovisual\n• Publicaciones relacionadas con el evento y futuros proyectos\n\nEn caso de oposición al uso de la imagen, el participante deberá comunicarlo previamente al Organizador por escrito.',
  },
  {
    title: '9. Seguridad de los datos',
    content:
      'GR Strength ha adoptado las medidas técnicas y organizativas necesarias para garantizar la confidencialidad, integridad y seguridad de los datos personales, evitando su alteración, pérdida, tratamiento o acceso no autorizado.',
  },
  {
    title: '10. Cookies',
    content:
      'Esta web utiliza cookies propias y de terceros con fines técnicos, analíticos y de mejora de la experiencia de usuario.\n\nEl usuario podrá aceptar, rechazar o configurar el uso de cookies mediante el banner habilitado en la página web o a través de la configuración de su navegador.',
  },
  {
    title: '11. Reclamaciones',
    content:
      'Si considera que el tratamiento de sus datos personales vulnera la normativa vigente, puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD):\n\nhttps://www.aepd.es',
  },
  {
    title: '12. Modificaciones de la política de privacidad',
    content:
      'GR Strength se reserva el derecho de modificar la presente Política de Privacidad para adaptarla a novedades legislativas, criterios jurisprudenciales o cambios en el funcionamiento del evento o de la web.\n\nLa versión actualizada estará siempre disponible en la página oficial.',
  },
  {
    title: '13. Contacto',
    content:
      'Para cualquier consulta relacionada con la protección de datos personales, puede contactar con el Organizador a través del correo electrónico indicado en la web oficial, indicando en el asunto:\n\n"Protección de Datos".',
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
