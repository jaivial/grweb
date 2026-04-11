import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { ScaleIcon } from '@components/ui/Icon/icons';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function TermsOfService(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/terms']} />
      <div className="min-h-screen bg-dark-base py-16 px-4" data-ui="terms-page">
      <div className="max-w-3xl mx-auto" data-ui="terms-container">
        <div className="text-center mb-12" data-ui="terms-header">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6" data-ui="terms-icon-circle">
            <ScaleIcon size="lg" className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" data-ui="terms-title">
            Términos de Servicio
          </h1>
          <p className="text-gray-400" data-ui="terms-updated">
            Última actualización: 1 de Abril de 2026
          </p>
        </div>

        <div className="bg-dark-surface rounded-2xl p-8 md:p-12 border border-gray-800 space-y-8" data-ui="terms-content">
          <section data-ui="terms-section-1">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-1-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-1-num">1</span>
              Aceptación de los Términos
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="terms-section-1-text">
              Al acceder y participar en el sorteo del GR Cup, aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguno de estos términos, por favor no participes en el sorteo.
            </p>
          </section>

          <section data-ui="terms-section-2">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-2-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-2-num">2</span>
              El Sorteo
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="terms-section-2-text">
              El <strong className="text-white">GR Cup 2026</strong> es un sorteo benéfico organizado por GR Strength. Cada ticket tiene un precio de <strong className="text-white">0,50 €</strong> (cincuenta céntimos de euro).
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="terms-section-2-list">
              <li data-ui="terms-section-2-li-1">El premio consiste en productos y experiencias relacionadas con powerlifting</li>
              <li data-ui="terms-section-2-li-2">El sorteo se realizará de forma aleatoria</li>
              <li data-ui="terms-section-2-li-3">Los fondos obtenidos se destinan a cubrir los costes del evento y los premios</li>
            </ul>
          </section>

          <section data-ui="terms-section-3">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-3-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-3-num">3</span>
              Elegibilidad
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="terms-section-3-text">
              Para participar en el sorteo debes:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="terms-section-3-list">
              <li data-ui="terms-section-3-li-1">Tener al menos <strong className="text-white">18 años</strong> de edad</li>
              <li data-ui="terms-section-3-li-2">Proporcionar información veraz y completa durante la compra</li>
              <li data-ui="terms-section-3-li-3">Disponer de un método de pago válido</li>
              <li data-ui="terms-section-3-li-4">No estar empleado por GR Strength ni ser familiar directo de los organizadores</li>
            </ul>
          </section>

          <section data-ui="terms-section-4">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-4-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-4-num">4</span>
              Compra de Tickets
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="terms-section-4-text">
              Al comprar tickets aceptas lo siguiente:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="terms-section-4-list">
              <li data-ui="terms-section-4-li-1">Cada ticket purchased representa una entrada válida para el sorteo</li>
              <li data-ui="terms-section-4-li-2">Los tickets no son reembolsables una vez comprado</li>
              <li data-ui="terms-section-4-li-3">El precio del ticket es de 0,50 € por unidad</li>
              <li data-ui="terms-section-4-li-4">Puedes comprar múltiples tickets para aumentar tus probabilidades</li>
              <li data-ui="terms-section-4-li-5">Los tickets purchased se confirmarán mediante email</li>
            </ul>
          </section>

          <section data-ui="terms-section-5">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-5-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-5-num">5</span>
              Selección del Ganador
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="terms-section-5-text">
              El ganador del sorteo será seleccionado de forma <strong className="text-white">completamente aleatoria</strong> utilizando un sistema de selección aleatoria certificado. El proceso se realizará en directo y se publicará en nuestras redes sociales.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="terms-section-5-list">
              <li data-ui="terms-section-5-li-1">Se seleccionará un (1) ganador principal</li>
              <li data-ui="terms-section-5-li-2">El ganador será contactado por email en un plazo de 48 horas</li>
              <li data-ui="terms-section-5-li-3">Si el ganador no responde en 7 días, se seleccionará un nuevo ganador</li>
              <li data-ui="terms-section-5-li-4">La decisión es final y no admite apelación</li>
            </ul>
          </section>

          <section data-ui="terms-section-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-6-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-6-num">6</span>
              Pago y Procesamiento
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="terms-section-6-text">
              Los pagos son procesados por <strong className="text-white">Stripe</strong>, nuestro proveedor de servicios de pago externo. GR Cup no almacena datos de tu tarjeta de crédito o débito. Al realizar una compra, aceptas los términos y condiciones de Stripe.
            </p>
          </section>

          <section data-ui="terms-section-7">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-7-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-7-num">7</span>
              Entrega del Premio
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="terms-section-7-text">
              Una vez confirmado el ganador, nos pondremos en contacto para coordinar la entrega del premio. El premio es intransferible y no puede canjearse por dinero en efectivo. Los costes de envío o recogida varierán según la ubicación del ganador.
            </p>
          </section>

          <section data-ui="terms-section-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-8-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-8-num">8</span>
              Limitación de Responsabilidad
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="terms-section-8-text">
              GR Strength no será responsable de cualquier pérdida, daño o inconveniente causado por la participación en el sorteo, excepto en случаях de negligencia grave o incumplimiento contractual. Nuestra responsabilidad total no excederá en ningún caso el valor del ticket purchased.
            </p>
          </section>

          <section data-ui="terms-section-9">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-9-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-9-num">9</span>
              Modificaciones
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="terms-section-9-text">
              GR Strength se reserva el derecho de modificar estos términos en cualquier momento. Los cambios significativos serán comunicados mediante email a los participantes. La participación continuada tras los cambios implica la aceptación de los nuevos términos.
            </p>
          </section>

          <section data-ui="terms-section-10">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="terms-section-10-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="terms-section-10-num">10</span>
              Ley Aplicable
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="terms-section-10-text">
              Estos Términos de Servicio se rigen por las leyes de <strong className="text-white">España</strong>. Cualquier controversia derivada de estos términos será resuelta en los tribunales competentes de España.
            </p>
          </section>

          <section className="bg-dark-base rounded-xl p-6 border border-gray-700" data-ui="terms-contact">
            <h2 className="text-xl font-bold text-white mb-3" data-ui="terms-contact-title">Contacto</h2>
            <p className="text-gray-300" data-ui="terms-contact-text">
              Si tienes preguntas sobre estos Términos de Servicio, contacta con nosotros:
            </p>
            <p className="text-red-accent mt-2" data-ui="terms-contact-email">admin@grstrength.com</p>
          </section>
        </div>

        <div className="text-center mt-8" data-ui="terms-back">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            data-testid="terms-back-link"
          >
            <Icon name="arrow-left" size="sm" />
              Volver al inicio
          </a>
        </div>
      </div>
      </div>
    </>
  );
}

export default TermsOfService;
