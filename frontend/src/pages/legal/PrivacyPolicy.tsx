import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { ShieldIcon } from '@components/ui/Icon/icons';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function PrivacyPolicy(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/privacy']} />
      <div className="min-h-screen bg-dark-base py-16 px-4" data-page="privacy-policy">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6">
            <ShieldIcon size="lg" className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Política de Privacidad
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
              Responsable del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed">
              <strong className="text-white">GR Strength</strong><br />
              Sitio web: <a href="https://www.grteam.net" target="_blank" rel="noopener noreferrer" className="text-red-accent hover:underline">https://www.grteam.net</a><br />
              Email de contacto: <span className="text-red-accent">admin@grstrength.com</span>
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">2</span>
              Datos que Recopilamos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Recopilamos únicamente los datos necesarios para participar en el sorteo del GR Cup:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Email:</strong> Para enviar confirmación de compra y notificaciones del sorteo</li>
              <li><strong className="text-white">Nombre y Apellido:</strong> Para identificar al ganador del premio</li>
              <li><strong className="text-white">Instagram:</strong> Para seguimiento y comunicación con los participantes (opcional)</li>
              <li><strong className="text-white">Datos de pago:</strong> Procesados directamente por Stripe, noi almacenamos datos de tarjetas</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">3</span>
              Finalidad del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Utilizamos tus datos exclusivamente para:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-2">
              <li>Procesar tu compra de tickets del sorteo</li>
              <li>Enviar confirmaciones y actualizaciones sobre el sorteo</li>
              <li>Contactar al ganador para organizar la entrega del premio</li>
              <li>Cumplir con las obligaciones legales aplicables</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">4</span>
              Procesamiento de Pagos
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Todos los pagos son procesados por <strong className="text-white">Stripe</strong>, un proveedor de pagos externo certificado PCI-DSS. GR Cup no almacena ningún dato de tarjeta de crédito o débito. Los datos de pago se transfieren directamente entre tu banco y Stripe de forma segura.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">5</span>
              Retención de Datos
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Conservamos tus datos personales durante el tiempo necesario para completar el sorteo y cumplir con nuestras obligaciones legales. Los datos de participantes se eliminan <strong className="text-white">30 días después</strong> de la celebración del sorteo, excepto los datos del ganador que se conservan para cumplimiento fiscal.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">6</span>
              Tus Derechos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Tienes los siguientes derechos sobre tus datos personales:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-white">Acceso:</strong> Solicitar una copia de tus datos</li>
              <li><strong className="text-white">Rectificación:</strong> Corregir datos inexactos</li>
              <li><strong className="text-white">Supresión:</strong> Solicitar la eliminación de tus datos</li>
              <li><strong className="text-white">Oposición:</strong> Oponerte al tratamiento</li>
              <li><strong className="text-white">Portabilidad:</strong> Recibir tus datos en formato estructurado</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Para ejercer cualquiera de estos derechos, contacta con nosotros en <span className="text-red-accent">admin@grstrength.com</span>.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">7</span>
              Cookies
            </h2>
            <p className="text-gray-300 leading-relaxed">
              <strong className="text-white">No utilizamos cookies de seguimiento o publicidad.</strong> Nuestro sitio solo usa cookies técnicas esenciales para el funcionamiento del carrito de compras y el proceso de pago, las cuales son necesarias para prestar el servicio solicitado.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">8</span>
              Seguridad
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Toda la comunicación con nuestro sitio está cifrada mediante TLS/SSL.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold">9</span>
              Cambios a esta Política
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Podemos actualizar esta Política de Privacidad periódicamente. Cualquier cambio será publicado en esta página con una fecha de "última actualización" revisada. Te recomendamos revisar esta política regularmente.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-dark-base rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-3">Contacto</h2>
            <p className="text-gray-300">
              Si tienes preguntas sobre esta Política de Privacidad, contacta con nosotros:
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
    </>
  );
}

export default PrivacyPolicy;
