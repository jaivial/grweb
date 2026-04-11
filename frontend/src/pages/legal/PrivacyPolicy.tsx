import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { ShieldIcon } from '@components/ui/Icon/icons';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function PrivacyPolicy(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/privacy']} />
      <div className="min-h-screen bg-dark-base py-16 px-4" data-ui="privacy-page">
      <div className="max-w-3xl mx-auto" data-ui="privacy-container">
        <div className="text-center mb-12" data-ui="privacy-header">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-accent/10 mb-6" data-ui="privacy-icon-circle">
            <ShieldIcon size="lg" className="text-red-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" data-ui="privacy-title">
            Política de Privacidad
          </h1>
          <p className="text-gray-400" data-ui="privacy-updated">
            Última actualización: 1 de Abril de 2026
          </p>
        </div>

        <div className="bg-dark-surface rounded-2xl p-8 md:p-12 border border-gray-800 space-y-8" data-ui="privacy-content">
          <section data-ui="privacy-section-1">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-1-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-1-num">1</span>
              Responsable del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-1-text">
              <strong className="text-white">GR Strength</strong><br />
              Sitio web: <a href="https://www.grteam.net" target="_blank" rel="noopener noreferrer" className="text-red-accent hover:underline" data-testid="privacy-website-link">https://www.grteam.net</a><br />
              Email de contacto: <span className="text-red-accent" data-ui="privacy-contact-email">admin@grstrength.com</span>
            </p>
          </section>

          <section data-ui="privacy-section-2">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-2-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-2-num">2</span>
              Datos que Recopilamos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="privacy-section-2-text">
              Recopilamos únicamente los datos necesarios para participar en el sorteo del GR Cup:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="privacy-section-2-list">
              <li data-ui="privacy-section-2-li-1"><strong className="text-white">Email:</strong> Para enviar confirmación de compra y notificaciones del sorteo</li>
              <li data-ui="privacy-section-2-li-2"><strong className="text-white">Nombre y Apellido:</strong> Para identificar al ganador del premio</li>
              <li data-ui="privacy-section-2-li-3"><strong className="text-white">Instagram:</strong> Para seguimiento y comunicación con los participantes (opcional)</li>
              <li data-ui="privacy-section-2-li-4"><strong className="text-white">Datos de pago:</strong> Procesados directamente por Stripe, noi almacenamos datos de tarjetas</li>
            </ul>
          </section>

          <section data-ui="privacy-section-3">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-3-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-3-num">3</span>
              Finalidad del Tratamiento
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-3-text">
              Utilizamos tus datos exclusivamente para:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-2" data-ui="privacy-section-3-list">
              <li data-ui="privacy-section-3-li-1">Procesar tu compra de tickets del sorteo</li>
              <li data-ui="privacy-section-3-li-2">Enviar confirmaciones y actualizaciones sobre el sorteo</li>
              <li data-ui="privacy-section-3-li-3">Contactar al ganador para organizar la entrega del premio</li>
              <li data-ui="privacy-section-3-li-4">Cumplir con las obligaciones legales aplicables</li>
            </ul>
          </section>

          <section data-ui="privacy-section-4">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-4-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-4-num">4</span>
              Procesamiento de Pagos
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-4-text">
              Todos los pagos son procesados por <strong className="text-white">Stripe</strong>, un proveedor de pagos externo certificado PCI-DSS. GR Cup no almacena ningún dato de tarjeta de crédito o débito. Los datos de pago se transfieren directamente entre tu banco y Stripe de forma segura.
            </p>
          </section>

          <section data-ui="privacy-section-5">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-5-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-5-num">5</span>
              Retención de Datos
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-5-text">
              Conservamos tus datos personales durante el tiempo necesario para completar el sorteo y cumplir con nuestras obligaciones legales. Los datos de participantes se eliminan <strong className="text-white">30 días después</strong> de la celebración del sorteo, excepto los datos del ganador que se conservan para cumplimiento fiscal.
            </p>
          </section>

          <section data-ui="privacy-section-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-6-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-6-num">6</span>
              Tus Derechos
            </h2>
            <p className="text-gray-300 leading-relaxed mb-4" data-ui="privacy-section-6-text">
              Tienes los siguientes derechos sobre tus datos personales:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4" data-ui="privacy-section-6-list">
              <li data-ui="privacy-section-6-li-1"><strong className="text-white">Acceso:</strong> Solicitar una copia de tus datos</li>
              <li data-ui="privacy-section-6-li-2"><strong className="text-white">Rectificación:</strong> Corregir datos inexactos</li>
              <li data-ui="privacy-section-6-li-3"><strong className="text-white">Supresión:</strong> Solicitar la eliminación de tus datos</li>
              <li data-ui="privacy-section-6-li-4"><strong className="text-white">Oposición:</strong> Oponerte al tratamiento</li>
              <li data-ui="privacy-section-6-li-5"><strong className="text-white">Portabilidad:</strong> Recibir tus datos en formato estructurado</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4" data-ui="privacy-section-6-contact">
              Para ejercer cualquiera de estos derechos, contacta con nosotros en <span className="text-red-accent" data-ui="privacy-section-6-email">admin@grstrength.com</span>.
            </p>
          </section>

          <section data-ui="privacy-section-7">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-7-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-7-num">7</span>
              Cookies
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-7-text">
              <strong className="text-white">No utilizamos cookies de seguimiento o publicidad.</strong> Nuestro sitio solo usa cookies técnicas esenciales para el funcionamiento del carrito de compras y el proceso de pago, las cuales son necesarias para prestar el servicio solicitado.
            </p>
          </section>

          <section data-ui="privacy-section-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-8-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-8-num">8</span>
              Seguridad
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-8-text">
              Implementamos medidas de seguridad técnicas y organizativa apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Toda la comunicación con nuestro sitio está cifrada mediante TLS/SSL.
            </p>
          </section>

          <section data-ui="privacy-section-9">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3" data-ui="privacy-section-9-title">
              <span className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-bold" data-ui="privacy-section-9-num">9</span>
              Cambios a esta Política
            </h2>
            <p className="text-gray-300 leading-relaxed" data-ui="privacy-section-9-text">
              Podemos actualizar esta Política de Privacidad periódicamente. Cualquier cambio será publicado en esta página con una fecha de "última actualización" revisada. Te recomendamos revisar esta política regularmente.
            </p>
          </section>

          <section className="bg-dark-base rounded-xl p-6 border border-gray-700" data-ui="privacy-contact">
            <h2 className="text-xl font-bold text-white mb-3" data-ui="privacy-contact-title">Contacto</h2>
            <p className="text-gray-300" data-ui="privacy-contact-text">
              Si tienes preguntas sobre esta Política de Privacidad, contacta con nosotros:
            </p>
            <p className="text-red-accent mt-2" data-ui="privacy-contact-email-footer">admin@grstrength.com</p>
          </section>
        </div>

        <div className="text-center mt-8" data-ui="privacy-back">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            data-testid="privacy-back-link"
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

export default PrivacyPolicy;
