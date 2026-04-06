import type { JSX } from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function DataConsent(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/consentimiento-datos']} />
      <div className="min-h-screen bg-dark-base py-16 px-4" data-page="data-consent">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6">
            <FileText size={24} className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Consentimiento de Datos
          </h1>
          <p className="text-gray-400">
            Última actualización: 1 de Abril de 2026
          </p>
        </div>

        {/* Content */}
        <div className="bg-dark-surface rounded-2xl p-8 md:p-12 border border-gray-800 space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">1</span>
              Información sobre el Tratamiento de Datos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              En cumplimiento del <strong className="text-white">Reglamento General de Protección de Datos (RGPD)</strong> y la <strong className="text-white">Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD)</strong>, te informamos sobre cómo tratamos tus datos personales.
            </p>
            <p className="text-gray-300 leading-relaxed">
              GR Strength, como responsable del tratamiento, necesita tu consentimiento explícito para recopilar y procesar tus datos personales con la finalidad de participar en el sorteo del GR Cup 2026.
            </p>
          </section>

          {/* Data Controller */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">2</span>
              Responsable del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed">
              <strong className="text-white">GR Strength</strong><br />
              Sitio web: <a href="https://www.grteam.net" target="_blank" rel="noopener noreferrer" className="text-red-accent hover:underline">https://www.grteam.net</a><br />
              Email de contacto: <span className="text-red-accent">admin@grstrength.com</span>
            </p>
          </section>

          {/* Data We Collect */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">3</span>
              Datos Personales que Recopilamos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Con tu consentimiento, recopilamos los siguientes datos personales:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Nombre completo:</strong> Para identificarte como participante y, en caso de ganar, para hacer efectivo el premio</li>
              <li><strong className="text-white">Correo electrónico:</strong> Para enviarte la confirmación de tu participación y notificaciones importantes sobre el sorteo</li>
              <li><strong className="text-white">Número de teléfono:</strong> Para contactarte en caso de resultar ganador</li>
              <li><strong className="text-white">Confirmación de seguimiento en Instagram:</strong> Para verificar el cumplimiento de los requisitos de participación</li>
              <li><strong className="text-white">Cantidad de tickets purchased:</strong> Para procesar tu participación en el sorteo</li>
            </ul>
          </section>

          {/* Purpose */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">4</span>
              Finalidad del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Tratamos tus datos personales con las siguientes finalidades:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Gestionar tu inscripción y participación en el sorteo del GR Cup 2026</li>
              <li>Procesar el pago de los tickets adquiridos a través de Stripe</li>
              <li>Enviar confirmaciones de compra y actualizaciones sobre el estado del sorteo</li>
              <li>Contactar al ganador para organizar la entrega del premio</li>
              <li>Cumplir con las obligaciones legales aplicables en materia fiscal y de consumo</li>
            </ul>
          </section>

          {/* Legal Basis */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">5</span>
              Base Legal del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              El tratamiento de tus datos personales se realiza bajo la siguiente base legal:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Tu consentimiento explícito</strong> (Art. 6.1.a RGPD): Al marcar la casilla de aceptación de este consentimiento, autorizas expresamente a GR Strength a tratar tus datos personales para los fines descritos.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              El suministro de datos es voluntary, pero necesario para participar en el sorteo. Si no proporcionas los datos requeridos, no podrás participar en el sorteo del GR Cup 2026.
            </p>
          </section>

          {/* Data Recipients */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">6</span>
              Destinatarios de los Datos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Tus datos personales pueden ser comunicados a los siguientes terceros:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Stripe:</strong> Para el procesamiento de pagos. Los datos de tu tarjeta de crédito/débito son tratados directamente por Stripe bajo su propia política de privacidad.</li>
              <li><strong className="text-white">Proveedores de servicios técnicos:</strong> Empresas que nos ayudan a operar nuestro sitio web y sistemas de manera segura.</li>
              <li><strong className="text-white">Autoridades legales:</strong> Cuando sea requerido por ley o para proteger nuestros derechos legales.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              No vendemos, alquilamos ni cedemos tus datos personales a terceros con fines de marketing.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">7</span>
              Plazo de Conservación
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Conservamos tus datos personales durante el tiempo necesario para cumplir con los fines para los que fueron recopilados. Concretamente:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-2">
              <li><strong className="text-white">Datos de participantes:</strong> Se eliminarán 30 días después de la celebración del sorteo, salvo los datos del ganador que se conservan durante 5 años para cumplimiento fiscal.</li>
              <li><strong className="text-white">Datos de pago:</strong> Conservamos los registros de transacción durante el periodo requerido por la normativa fiscal española (mínimo 5 años).</li>
            </ul>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">8</span>
              Tus Derechos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Tienes los siguientes derechos sobre tus datos personales:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Acceso:</strong> Obtener confirmación de si estamos tratando tus datos y acceder a los mismos.</li>
              <li><strong className="text-white">Rectificación:</strong> Corregir datos inexactos o incompletos.</li>
              <li><strong className="text-white">Supresión:</strong> Solicitar la eliminación de tus datos cuando ya no sean necesarios para los fines最初的.</li>
              <li><strong className="text-white">Limitación:</strong> Solicitar que limitemos el tratamiento de tus datos en determinadas circunstancias.</li>
              <li><strong className="text-white">Oposición:</strong> Oponerte al tratamiento de tus datos.</li>
              <li><strong className="text-white">Portabilidad:</strong> Recibir tus datos en un formato estructurado y transferirlos a otro responsable.</li>
              <li><strong className="text-white">Revocación:</strong> Retirar tu consentimiento en cualquier momento, sin afectar a la licitud del tratamiento previo.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Para ejercer cualquiera de estos derechos, contacta con nosotros en <span className="text-red-accent">admin@grstrength.com</span>. Responderemos a tu solicitud en el plazo máximo de un mes.
            </p>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">9</span>
              Medidas de Seguridad
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Estas medidas incluyen:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-2">
              <li>Cifrado de datos en tránsito mediante TLS/SSL</li>
              <li>Acceso restringido a datos personales solo para personal autorizado</li>
              <li>Monitoreo continuo de nuestros sistemas para detectar vulnerabilidades</li>
              <li>Respaldo periódico de datos</li>
            </ul>
          </section>

          {/* International Transfers */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">10</span>
              Transferencias Internacionales
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Certains de nuestros proveedores de servicios (como Stripe) pueden transferir tus datos a países fuera del Espacio Económico Europeo (EEE). En tales casos, nos aseguramos de que existen garantías adecuadas, como cláusulas contractuales tipo aprobadas por la Comisión Europea.
            </p>
          </section>

          {/* Complaints */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">11</span>
              Derecho a Reclamar
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Sin perjuicio de cualquier otro recurso administrativo o judicial, tienes derecho a presentar una reclamación ante la <strong className="text-white">Agencia Española de Protección de Datos (AEPD)</strong> si consideras que el tratamiento de tus datos personales vulnera la normativa de protección de datos.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Más información: <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-red-accent hover:underline">https://www.aepd.es</a>
            </p>
          </section>

          {/* Contact */}
          <section className="bg-dark-base rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-3">Contacto</h2>
            <p className="text-gray-300">
              Si tienes preguntas sobre este Consentimiento de Datos o sobre cómo tratamos tus datos personales, contacta con nosotros:
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

export default DataConsent;
