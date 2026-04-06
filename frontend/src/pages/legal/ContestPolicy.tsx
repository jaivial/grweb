import type { JSX } from 'react';
import { Scale, ArrowLeft } from 'lucide-react';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function ContestPolicy(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/politica-concurso']} />
      <div className="min-h-screen bg-dark-base py-16 px-4" data-page="contest-policy">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6">
            <Scale size={24} className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Política del Concurso
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
              Aceptación de las Bases
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Al participar en el sorteo del <strong className="text-white">GR Cup 2026</strong>, aceptas íntegramente estas bases y condiciones. Si no estás de acuerdo con alguno de los términos aquí establecidos, por favor no participes en el sorteo. La participación implica la aceptación penuh de estas condiciones.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">2</span>
              Organizador del Concurso
            </h2>
            <p className="text-gray-300 leading-relaxed">
              El sorteo del GR Cup 2026 está organizado por <strong className="text-white">GR Strength</strong>, con domicilio en España y dirección de contacto <span className="text-red-accent">admin@grstrength.com</span>.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">3</span>
              Periodo de Participación
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El periodo de participación en el sorteo del GR Cup 2026 comprende desde la fecha de inicio hasta la fecha de cierre indicadas en la página oficial del sorteo. Las fechas específicas serán comunicadas a través de:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>La página web oficial del sorteo</li>
              <li>Las redes sociales de GR Strength (Instagram: @grstrength)</li>
              <li>Comunicados por correo electrónico a los participantes registrados</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">4</span>
              Elegibilidad para Participar
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              <strong className="text-white">Requisitos obligatorios:</strong>
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Tener al menos <strong className="text-white">18 años de edad</strong> en el momento de la participación</li>
              <li>Disponer de un documento de identidad válido (DNI, NIE, pasaporte o equivalente)</li>
              <li>Tener capacidad legal para celebrar contratos</li>
              <li>Proporcionar información veraz, completa y actualizada durante el registro</li>
              <li>Disponer de una cuenta de correo electrónico válida</li>
              <li>Disponer de un número de teléfono móvil para recibir notificaciones</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4 mb-4">
              <strong className="text-white">Requisitos adicionales para ser elegible:</strong>
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Seguir la cuenta oficial de Instagram de GR Strength (@grstrength) durante todo el periodo del sorteo</li>
              <li>Completar correctamente todos los campos del formulario de inscripción</li>
              <li>Aceptar el presente política del concurso</li>
              <li>Aceptar el tratamiento de sus datos personales conforme al consentimiento informado</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong className="text-red-accent">No pueden participar:</strong> Empleados de GR Strength ni sus familiares directos (hasta primer grado de consanguinidad o afinidad), ni personas involucradas en la organización técnica del sorteo.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">5</span>
              Precio y Compra de Tickets
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Cada ticket de participación tiene un precio de <strong className="text-white">0,50 € (cincuenta céntimos de euro)</strong>, IVA incluido.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Puedes comprar tantos tickets como desees para aumentar tus probabilidades de ganar</li>
              <li>Cada ticket purchased genera una entrada única en el sorteo</li>
              <li>Los tickets no son transferibles ni canjeables por dinero en efectivo</li>
              <li>Los tickets no son reembolsables una vez completada la compra</li>
              <li>El pago se realiza exclusivamente a través de Stripe Checkout con tarjeta de crédito o débito</li>
              <li>Métodos de pago aceptados: Visa, Mastercard, American Express, y otros según disponibilidad de Stripe</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              La compra de tickets se confirmará mediante un correo electrónico de confirmación enviado a la dirección proporcionada durante el registro.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">6</span>
              Premio
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El premio del sorteo del GR Cup 2026 consiste en:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">[Descripción del premio]</strong> - Un cinturón SBD de alta calidad</li>
              <li>El premio es intransferible</li>
              <li>El premio no puede canjearse por dinero en efectivo o cualquier otro producto</li>
              <li>GR Strength se reserva el derecho de substituir el premio por otro de valor equivalente en caso de indisponibilidad</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              El valor total del premio no excederá los <strong className="text-white">500 €</strong>.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">7</span>
              Selección del Ganador
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El ganador del sorteo será seleccionado mediante <strong className="text-white">selección aleatoria pura</strong> utilizando un sistema de generación de números aleatorios certificado.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Se realizará un único sorteo para determinar al ganador del premio principal</li>
              <li>El sorteo se realizará en la fecha indicada, públicamente a través de redes sociales</li>
              <li>El proceso de selección será grabado en video para garantizar la transparencia</li>
              <li>Se generará un registro digital del resultado del sorteo</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong className="text-white">Probabilidades de ganar:</strong> Las probabilidades de ganar son proporcionales al número de tickets purchased. Si compras 1 ticket de un total de 100 tickets vendidos, tu probabilidad de ganar es de 1%.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">8</span>
              Notificación y Entrega del Premio
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El ganador será notificado de la siguiente manera:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Correo electrónico:</strong> Se enviará un email a la dirección proporcionada durante la compra</li>
              <li><strong className="text-white">Publicación en redes sociales:</strong> Se anunciará el ganador (solo el nombre de pila) en Instagram y en la web oficial</li>
              <li><strong className="text-white">Plazo de respuesta:</strong> El ganador dispone de <strong className="text-white">7 días naturales</strong> para responder y confirmar sus datos</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Si el ganador no responde en el plazo indicado, no es elegible, o renuncia al premio, se procederá a seleccionar un <strong className="text-white">ganador alternativo</strong> siguiendo el mismo procedimiento aleatorio.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4">
              La entrega del premio se coordinará directamente con el ganador. Los costes de envío corren a cargo de GR Strength para destinos en España. Para destinos internacionales, pueden aplicarse costes adicionales de envío que serán comunicados previamente.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">9</span>
              Prevención de Fraude
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              GR Strength se compromete a garantizar la integridad del sorteo. Está estrictamente prohibido:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Utilizar cuentas de Instagram falsas o múltiplos para inflar las probabilidades</li>
              <li>Proporcionar información falsa o identidad ajena durante el registro</li>
              <li>Realizar compras de tickets mediante tarjetas de crédito robadas o fraudulentas</li>
              <li>Manipular el proceso de selección del ganador</li>
              <li>Cualquier otra acción que infrinja la legislación vigente</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong className="text-white">Consecuencias:</strong> Si se detecta cualquier intento de fraude, GR Strength se reserva el derecho de disqualificar al participante infractor, cancelar sus tickets sin reembolso, y emprender las acciones legales pertinentes.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">10</span>
              Limitación de Responsabilidad
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              GR Strength no será responsable de:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Fallos técnicos, errores de software o硬件 que puedan afectar al proceso de compra o al sorteo</li>
              <li>Inscripciones perdidas, retrasadas, incompletas o defectuosas por causas técnicas</li>
              <li>Interrupciones del servicio de Internet o de la plataforma de pago</li>
              <li>Datos proporcionados incorrectamente por el participante</li>
              <li>Cualquier daño indirecto, incidental o consequential derivados de la participación en el sorteo</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              La responsabilidad total de GR Strength en relación con este sorteo no excederá, en ningún caso, el valor total de los tickets purchased por el participante afectado.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">11</span>
              Modificaciones y Cancelación
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              GR Strength se reserva el derecho de:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Modificar estas bases:</strong> Cualquier cambio será comunicado con antelación razonable a través de la página web y correo electrónico a los participantes registrados</li>
              <li><strong className="text-white">Cancelar el sorteo:</strong> En caso de circunstancias imprevistas, fuerza mayor, o problemas técnicos graves, GR Strength puede cancelar el sorteo. En tal caso, se reembolsará el importe de los tickets purchased a todos los participantes</li>
              <li><strong className="text-white">Suspender temporalmente:</strong> El sorteo puede ser suspendido temporalmente para resolver problemas técnicos</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              La participación continuada tras la comunicación de modificaciones implica la aceptación de las nuevas bases.
            </p>
          </section>

          {/* Section 12 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">12</span>
              Ley Aplicable y Jurisdicción
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Este concurso se rige por las leyes de <strong className="text-white">España</strong>.
            </p>
            <p className="text-gray-300 leading-relaxed mb-4">
              Para cualquier controversia derivada de la interpretación o ejecución de estas bases, las partes se someten a los <strong className="text-white">tribunales competentes de España</strong>, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Antes de iniciar cualquier acción legal, el participante se compromete a contactar con GR Strength para intentar resolver cualquier dispute de manera amistosa.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">13</span>
              Información sobre el Premio y DISCLAIMER
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El premio se describe en la sección 6 de este documento. Las imágenes utilizadas en el material promocional son orientativas y pueden no corresponder exactamente con el premio real.
            </p>
            <p className="text-gray-300 leading-relaxed">
              GR Strength no ofrece ninguna garantía, explícita o implícita, sobre el premio, incluyendo garantías de comerciabilidad o idoneidad para un propósito particular.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-dark-base rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-3">Contacto</h2>
            <p className="text-gray-300">
              Si tienes preguntas sobre esta Política del Concurso, contacta con nosotros:
            </p>
            <p className="text-red-accent mt-2">admin@grstrength.com</p>
          </section>
        </div>

        {/* Back to Raffle */}
        <div className="text-center mt-8">
          <a
            href="/raffle"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
              Volver al sorteo
          </a>
        </div>
      </div>
      </div>
    </>
  );
}

export default ContestPolicy;
