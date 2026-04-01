import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { ScaleIcon } from '@components/ui/Icon/icons';

export function TermsOfService(): JSX.Element {
  return (
    <div className="min-h-screen bg-dark-base py-16 px-4" data-page="terms-of-service">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6">
            <ScaleIcon size="lg" className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Términos de Servicio
          </h1>
          <p className="text-gray-400">
            Última actualización: 1 de Abril de 2026
          </p>
        </div>

        {/* Content */}
        <div className="bg-dark-surface rounded-2xl p-8 md:p-12 border border-gray-800 space-y-8">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">1</span>
              Aceptación de los Términos
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Al acceder y participar en el sorteo del GR Cup, aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguno de estos términos, por favor no participes en el sorteo.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">2</span>
              El Sorteo
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El <strong className="text-white">GR Cup 2026</strong> es un sorteo benéfico organizado por GR Strength. Cada ticket tiene un precio de <strong className="text-white">0,50 €</strong> (cincuenta céntimos de euro).
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>El premio consiste en productos y experiencias relacionadas con powerlifting</li>
              <li>El sorteo se realizará de forma aleatoria</li>
              <li>Los fondos obtenidos se destinan a cubrir los costes del evento y los premios</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">3</span>
              Elegibilidad
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Para participar en el sorteo debes:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Tener al menos <strong className="text-white">18 años</strong> de edad</li>
              <li>Proporcionar información veraz y completa durante la compra</li>
              <li>Disponer de un método de pago válido</li>
              <li>No estar empleado por GR Strength ni ser familiar directo de los organizadores</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">4</span>
              Compra de Tickets
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Al comprar tickets aceptas lo siguiente:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Cada ticket purchased representa una entrada válida para el sorteo</li>
              <li>Los tickets no son reembolsables una vez comprado</li>
              <li>El precio del ticket es de 0,50 € por unidad</li>
              <li>Puedes comprar múltiples tickets para aumentar tus probabilidades</li>
              <li>Los tickets purchased se confirmarán mediante email</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">5</span>
              Selección del Ganador
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El ganador del sorteo será seleccionado de forma <strong className="text-white">completamente aleatoria</strong> utilizando un sistema de selección aleatoria certificado. El proceso se realizará en directo y se publicará en nuestras redes sociales.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Se seleccionará un (1) ganador principal</li>
              <li>El ganador será contactado por email en un plazo de 48 horas</li>
              <li>Si el ganador no responde en 7 días, se seleccionará un nuevo ganador</li>
              <li>La decisión es final y no admite apelación</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">6</span>
              Pago y Procesamiento
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Los pagos son procesados por <strong className="text-white">Stripe</strong>, nuestro proveedor de servicios de pago externo. GR Cup no almacena datos de tu tarjeta de crédito o débito. Al realizar una compra, aceptas los términos y condiciones de Stripe.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">7</span>
              Entrega del Premio
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Una vez confirmado el ganador, nos pondremos en contacto para coordinar la entrega del premio. El premio es intransferible y no puede canjearse por dinero en efectivo. Los costes de envío o recogida varierán según la ubicación del ganador.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">8</span>
              Limitación de Responsabilidad
            </h2>
            <p className="text-gray-300 leading-relaxed">
              GR Strength no será responsable de cualquier pérdida, daño o inconveniente causado por la participación en el sorteo, excepto en случаях de negligencia grave o incumplimiento contractual. Nuestra responsabilidad total no excederá en ningún caso el valor del ticket purchased.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">9</span>
              Modificaciones
            </h2>
            <p className="text-gray-300 leading-relaxed">
              GR Strength se reserva el derecho de modificar estos términos en cualquier momento. Los cambios significativos serán comunicados mediante email a los participantes. La participación continuada tras los cambios implica la aceptación de los nuevos términos.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">10</span>
              Ley Aplicable
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Estos Términos de Servicio se rigen por las leyes de <strong className="text-white">España</strong>. Cualquier controversia derivada de estos términos será resuelta en los tribunales competentes de España.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-dark-base rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-3">Contacto</h2>
            <p className="text-gray-300">
              Si tienes preguntas sobre estos Términos de Servicio, contacta con nosotros:
            </p>
            <p className="text-red-accent mt-2">admin@grstrength.com</p>
          </section>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <Icon name="arrow-left" size="sm" />
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export default TermsOfService;
