import type { JSX } from 'react';
import { Scale, ArrowLeft } from 'lucide-react';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function ContestPolicy(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/politica-concurso']} />
      <div className="min-h-screen bg-dark-base py-16 px-4" data-ui="contest-policy-page">
      <div className="max-w-3xl mx-auto" data-ui="contest-policy-container">
        <div className="text-center mb-12" data-ui="contest-policy-header">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6" data-ui="contest-policy-icon-circle">
            <Scale size={24} className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" data-ui="contest-policy-title">
            Política del Concurso
          </h1>
          <p className="text-gray-400" data-ui="contest-policy-updated">
            Última actualización: 1 de Abril de 2026
          </p>
        </div>

        <div className="bg-dark-surface rounded-2xl p-8 md:p-12 border border-gray-800 space-y-8" data-ui="contest-policy-content">
          <section data-ui="contest-section-1">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-1-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-1-num">1</span>
              Aceptación de las Bases
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="contest-section-1-text">
              Al participar en el sorteo del <strong className="text-white">GR Cup 2026</strong>, aceptas íntegramente estas bases y condiciones. Si no estás de acuerdo con alguno de los términos aquí establecidos, por favor no participes en el sorteo. La participación implica la aceptación penuh de estas condiciones.
            </p>
          </section>

          <section data-ui="contest-section-2">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-2-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-2-num">2</span>
              Organizador del Concurso
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="contest-section-2-text">
              El sorteo del GR Cup 2026 está organizado por <strong className="text-white">GR Strength</strong>, con domicilio en España y dirección de contacto <span className="text-red-accent" data-ui="contest-section-2-email">admin@grstrength.com</span>.
            </p>
          </section>

          <section data-ui="contest-section-3">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-3-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-3-num">3</span>
              Periodo de Participación
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-3-text">
              El periodo de participación en el sorteo del GR Cup 2026 comprende desde la fecha de inicio hasta la fecha de cierre indicadas en la página oficial del sorteo. Las fechas específicas serán comunicadas a través de:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-3-list">
              <li data-ui="contest-section-3-li-1">La página web oficial del sorteo</li>
              <li data-ui="contest-section-3-li-2">Las redes sociales de GR Strength (Instagram: @grstrength)</li>
              <li data-ui="contest-section-3-li-3">Comunicados por correo electrónico a los participantes registrados</li>
            </ul>
          </section>

          <section data-ui="contest-section-4">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-4-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-4-num">4</span>
              Elegibilidad para Participar
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-4-subtitle">
              <strong className="text-white">Requisitos obligatorios:</strong>
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-4-list-a">
              <li data-ui="contest-section-4-li-1">Tener al menos <strong className="text-white">18 años de edad</strong> en el momento de la participación</li>
              <li data-ui="contest-section-4-li-2">Disponer de un documento de identidad válido (DNI, NIE, pasaporte o equivalente)</li>
              <li data-ui="contest-section-4-li-3">Tener capacidad legal para celebrar contratos</li>
              <li data-ui="contest-section-4-li-4">Proporcionar información veraz, completa y actualizada durante el registro</li>
              <li data-ui="contest-section-4-li-5">Disponer de una cuenta de correo electrónico válida</li>
              <li data-ui="contest-section-4-li-6">Disponer de un número de teléfono móvil para recibir notificaciones</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4 mb-4" data-ui="contest-section-4-subtitle-b">
              <strong className="text-white">Requisitos adicionales para ser elegible:</strong>
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-4-list-b">
              <li data-ui="contest-section-4-li-7">Seguir la cuenta oficial de Instagram de GR Strength (@grstrength) durante todo el periodo del sorteo</li>
              <li data-ui="contest-section-4-li-8">Completar correctamente todos los campos del formulario de inscripción</li>
              <li data-ui="contest-section-4-li-9">Aceptar el presente política del concurso</li>
              <li data-ui="contest-section-4-li-10">Aceptar el tratamiento de sus datos personales conforme al consentimiento informado</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-4-note">
              <strong className="text-red-accent">No pueden participar:</strong> Empleados de GR Strength ni sus familiares directos (hasta primer grado de consanguinidad o afinidad), ni personas involucradas en la organización técnica del sorteo.
            </p>
          </section>

          <section data-ui="contest-section-5">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-5-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-5-num">5</span>
              Precio y Compra de Tickets
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-5-text">
              Cada ticket de participación tiene un precio de <strong className="text-white">0,50 € (cincuenta céntimos de euro)</strong>, IVA incluido.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-5-list">
              <li data-ui="contest-section-5-li-1">Puedes comprar tantos tickets como desees para aumentar tus probabilidades de ganar</li>
              <li data-ui="contest-section-5-li-2">Cada ticket purchased genera una entrada única en el sorteo</li>
              <li data-ui="contest-section-5-li-3">Los tickets no son transferibles ni canjeables por dinero en efectivo</li>
              <li data-ui="contest-section-5-li-4">Los tickets no son reembolsables una vez completada la compra</li>
              <li data-ui="contest-section-5-li-5">El pago se realiza exclusivamente a través de Stripe Checkout con tarjeta de crédito o débito</li>
              <li data-ui="contest-section-5-li-6">Métodos de pago aceptados: Visa, Mastercard, American Express, y otros según disponibilidad de Stripe</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-5-note">
              La compra de tickets se confirmará mediante un correo electrónico de confirmación enviado a la dirección proporcionada durante el registro.
            </p>
          </section>

          <section data-ui="contest-section-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-6-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-6-num">6</span>
              Premio
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-6-text">
              El premio del sorteo del GR Cup 2026 consiste en:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-6-list">
              <li data-ui="contest-section-6-li-1"><strong className="text-white">[Descripción del premio]</strong> - Un cinturón SBD de alta calidad</li>
              <li data-ui="contest-section-6-li-2">El premio es intransferible</li>
              <li data-ui="contest-section-6-li-3">El premio no puede canjearse por dinero en efectivo o cualquier otro producto</li>
              <li data-ui="contest-section-6-li-4">GR Strength se reserva el derecho de substituir el premio por otro de valor equivalente en caso de indisponibilidad</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-6-note">
              El valor total del premio no excederá los <strong className="text-white">500 €</strong>.
            </p>
          </section>

          <section data-ui="contest-section-7">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-7-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-7-num">7</span>
              Selección del Ganador
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-7-text">
              El ganador del sorteo será seleccionado mediante <strong className="text-white">selección aleatoria pura</strong> utilizando un sistema de generación de números aleatorios certificado.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-7-list">
              <li data-ui="contest-section-7-li-1">Se realizará un único sorteo para determinar al ganador del premio principal</li>
              <li data-ui="contest-section-7-li-2">El sorteo se realizará en la fecha indicada, públicamente a través de redes sociales</li>
              <li data-ui="contest-section-7-li-3">El proceso de selección será grabado en video para garantizar la transparencia</li>
              <li data-ui="contest-section-7-li-4">Se generará un registro digital del resultado del sorteo</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-7-probability">
              <strong className="text-white">Probabilidades de ganar:</strong> Las probabilidades de ganar son proporcionales al número de tickets purchased. Si compras 1 ticket de un total de 100 tickets vendidos, tu probabilidad de ganar es de 1%.
            </p>
          </section>

          <section data-ui="contest-section-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-8-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-8-num">8</span>
              Notificación y Entrega del Premio
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-8-text">
              El ganador será notificado de la siguiente manera:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-8-list">
              <li data-ui="contest-section-8-li-1"><strong className="text-white">Correo electrónico:</strong> Se enviará un email a la dirección proporcionada durante la compra</li>
              <li data-ui="contest-section-8-li-2"><strong className="text-white">Publicación en redes sociales:</strong> Se anunciará el ganador (solo el nombre de pila) en Instagram y en la web oficial</li>
              <li data-ui="contest-section-8-li-3"><strong className="text-white">Plazo de respuesta:</strong> El ganador dispone de <strong className="text-white">7 días naturales</strong> para responder y confirmar sus datos</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-8-alt">
              Si el ganador no responde en el plazo indicado, no es elegible, o renuncia al premio, se procederá a seleccionar un <strong className="text-white">ganador alternativo</strong> siguiendo el mismo procedimiento aleatorio.
            </p>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-8-delivery">
              La entrega del premio se coordinará directamente con el ganador. Los costes de envío corren a cargo de GR Strength para destinos en España. Para destinos internacionales, pueden aplicarse costes adicionales de envío que serán comunicados previamente.
            </p>
          </section>

          <section data-ui="contest-section-9">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-9-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-9-num">9</span>
              Prevención de Fraude
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-9-text">
              GR Strength se compromete a garantizar la integridad del sorteo. Está estrictamente prohibido:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-9-list">
              <li data-ui="contest-section-9-li-1">Utilizar cuentas de Instagram falsas o múltiplos para inflar las probabilidades</li>
              <li data-ui="contest-section-9-li-2">Proporcionar información falsa o identidad ajena durante el registro</li>
              <li data-ui="contest-section-9-li-3">Realizar compras de tickets mediante tarjetas de crédito robadas o fraudulentas</li>
              <li data-ui="contest-section-9-li-4">Manipular el proceso de selección del ganador</li>
              <li data-ui="contest-section-9-li-5">Cualquier otra acción que infrinja la legislación vigente</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-9-consequences">
              <strong className="text-white">Consecuencias:</strong> Si se detecta cualquier intento de fraude, GR Strength se reserva el derecho de disqualificar al participante infractor, cancelar sus tickets sin reembolso, y emprender las acciones legales pertinentes.
            </p>
          </section>

          <section data-ui="contest-section-10">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-10-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-10-num">10</span>
              Limitación de Responsabilidad
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-10-text">
              GR Strength no será responsable de:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-10-list">
              <li data-ui="contest-section-10-li-1">Fallos técnicos, errores de software o硬件 que puedan afectar al proceso de compra o al sorteo</li>
              <li data-ui="contest-section-10-li-2">Inscripciones perdidas, retrasadas, incompletas o defectuosas por causas técnicas</li>
              <li data-ui="contest-section-10-li-3">Interrupciones del servicio de Internet o de la plataforma de pago</li>
              <li data-ui="contest-section-10-li-4">Datos proporcionados incorrectamente por el participante</li>
              <li data-ui="contest-section-10-li-5">Cualquier daño indirecto, incidental o consequential derivados de la participación en el sorteo</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-10-note">
              La responsabilidad total de GR Strength en relación con este sorteo no excederá, en ningún caso, el valor total de los tickets purchased por el participante afectado.
            </p>
          </section>

          <section data-ui="contest-section-11">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-11-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-11-num">11</span>
              Modificaciones y Cancelación
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-11-text">
              GR Strength se reserva el derecho de:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="contest-section-11-list">
              <li data-ui="contest-section-11-li-1"><strong className="text-white">Modificar estas bases:</strong> Cualquier cambio será comunicado con antelación razonable a través de la página web y correo electrónico a los participantes registrados</li>
              <li data-ui="contest-section-11-li-2"><strong className="text-white">Cancelar el sorteo:</strong> En caso de circunstancias imprevistas, fuerza mayor, o problemas técnicos graves, GR Strength puede cancelar el sorteo. En tal caso, se reembolsará el importe de los tickets purchased a todos los participantes</li>
              <li data-ui="contest-section-11-li-3"><strong className="text-white">Suspender temporalmente:</strong> El sorteo puede ser suspendido temporalmente para resolver problemas técnicos</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="contest-section-11-note">
              La participación continuada tras la comunicación de modificaciones implica la aceptación de las nuevas bases.
            </p>
          </section>

          <section data-ui="contest-section-12">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-12-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-12-num">12</span>
              Ley Aplicable y Jurisdicción
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-12-text-a">
              Este concurso se rige por las leyes de <strong className="text-white">España</strong>.
            </p>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-12-text-b">
              Para cualquier controversia derivada de la interpretación o ejecución de estas bases, las partes se someten a los <strong className="text-white">tribunales competentes de España</strong>, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.
            </p>
            <p className="text-gray-300 leading-relaxed" data-ui="contest-section-12-text-c">
              Antes de iniciar cualquier acción legal, el participante se compromete a contactar con GR Strength para intentar resolver cualquier dispute de manera amistosa.
            </p>
          </section>

          <section data-ui="contest-section-13">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="contest-section-13-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="contest-section-13-num">13</span>
              Información sobre el Premio y DISCLAIMER
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="contest-section-13-text-a">
              El premio se describe en la sección 6 de este documento. Las imágenes utilizadas en el material promocional son orientativas y pueden no corresponder exactamente con el premio real.
            </p>
            <p className="text-gray-300 leading-relaxed" data-ui="contest-section-13-text-b">
              GR Strength no ofrece ninguna garantía, explícita o implícita, sobre el premio, incluyendo garantías de comerciabilidad o idoneidad para un propósito particular.
            </p>
          </section>

          <section className="bg-dark-base rounded-xl p-6 border border-gray-700" data-ui="contest-contact">
            <h2 className="text-xl font-bold text-white mb-3" data-ui="contest-contact-title">Contacto</h2>
            <p className="text-gray-300" data-ui="contest-contact-text">
              Si tienes preguntas sobre esta Política del Concurso, contacta con nosotros:
            </p>
            <p className="text-red-accent mt-2" data-ui="contest-contact-email">admin@grstrength.com</p>
          </section>
        </div>

        <div className="text-center mt-8" data-ui="contest-back">
          <a
            href="/raffle"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            data-testid="contest-back-link"
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
