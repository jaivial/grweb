-- +goose Up
-- QA U18-R1-1/2/5: the legal pages publish the exact texts of Figma 12–15 (titles, numbered sections, date
-- 1 April 2026) instead of the «Datos de ejemplo» seed. Earlier published versions of these four texts are
-- unpublished (rows kept: consents keep citing their version) so the Figma one is the one in force. Only the GR Cup:
-- the cms database has no slugs, and the GR Cup is the competition seeded with the «Datos de ejemplo» texts.
CREATE TEMP TABLE grcup_legal ON COMMIT DROP AS SELECT DISTINCT competition_id FROM legal WHERE contenido LIKE '> **Datos de ejemplo.**%';
UPDATE legal SET publicado_at = NULL
WHERE competition_id IN (SELECT competition_id FROM grcup_legal) AND tipo IN ('privacidad', 'terminos', 'consentimiento', 'bases-sorteo') AND publicado_at IS NOT NULL AND version <> '2026-04';

INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash, publicado_at)
SELECT gen_random_uuid(), c.competition_id, v.tipo, '2026-04', v.titulo, v.contenido, encode(sha256(convert_to(v.contenido, 'UTF8')), 'hex'), '2026-04-01 10:00:00+02'
FROM grcup_legal c
CROSS JOIN (VALUES
  ('privacidad', 'Política de Privacidad', $txt$## Responsable del Tratamiento

GR Strength Sitio web: https://www.grteam.net Email de contacto: admin@grstrength.com

## Datos que Recopilamos

Recopilamos únicamente los datos necesarios para participar en el sorteo del GR Cup:

- Email: Para enviar confirmación de compra y notificaciones del sorteo
- Nombre y Apellido: Para identificar al ganador del premio
- Instagram: Para seguimiento y comunicación con los participantes (opcional)
- Datos de pago: Procesados directamente por Stripe, no almacenamos datos de tarjetas

## Finalidad del Tratamiento

Utilizamos tus datos exclusivamente para:

- Procesar tu compra de tickets del sorteo
- Enviar confirmaciones y actualizaciones sobre el sorteo
- Contactar al ganador para organizar la entrega del premio
- Cumplir con las obligaciones legales aplicables

## Procesamiento de Pagos

Todos los pagos son procesados por Stripe, un proveedor de pagos externo certificado PCI-DSS. GR Cup no almacena ningún dato de tarjeta de crédito o débito. Los datos de pago se transfieren directamente entre tu banco y Stripe de forma segura.

## Retención de Datos

Conservamos tus datos personales durante el tiempo necesario para completar el sorteo y cumplir con nuestras obligaciones legales. Los datos de participantes se eliminan 30 días después de la celebración del sorteo, excepto los datos del ganador que se conservan para cumplimiento fiscal.

## Tus Derechos

Tienes los siguientes derechos sobre tus datos personales:

- Acceso: Solicitar una copia de tus datos
- Rectificación: Corregir datos inexactos
- Supresión: Solicitar la eliminación de tus datos
- Oposición: Oponerte al tratamiento
- Portabilidad: Recibir tus datos en formato estructurado

Para ejercer cualquiera de estos derechos, contacta con nosotros en admin@grstrength.com.

## Cookies

No utilizamos cookies de seguimiento o publicidad. Nuestro sitio solo usa cookies técnicas esenciales para el funcionamiento del carrito de compras y el proceso de pago, las cuales son necesarias para prestar el servicio solicitado.

## Seguridad

Implementamos medidas de seguridad técnicas y organizativa apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Toda la comunicación con nuestro sitio está cifrada mediante TLS/SSL.

## Cambios a esta Política

Podemos actualizar esta Política de Privacidad periódicamente. Cualquier cambio será publicado en esta página con una fecha de "última actualización" revisada. Te recomendamos revisar esta política regularmente.

## Contacto

Si tienes preguntas sobre esta Política de Privacidad, contacta con nosotros:

admin@grstrength.com$txt$),
  ('terminos', 'Términos de Servicio', $txt$## Aceptación de los Términos

Al acceder y participar en el sorteo del GR Cup, aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguno de estos términos, por favor no participes en el sorteo.

## El Sorteo

El GR Cup 2026 es un sorteo organizado por GR Strength. Cada ticket tiene un precio de 0,50 € (cincuenta céntimos de euro).

- El premio consiste en productos y experiencias relacionadas con powerlifting
- El sorteo se realizará de forma aleatoria
- Los fondos obtenidos se destinan a cubrir los costes del evento y los premios

## Elegibilidad

Para participar en el sorteo debes:

- Tener al menos 18 años de edad
- Proporcionar información veraz y completa durante la compra
- Disponer de un método de pago válido
- No estar empleado por GR Strength ni ser familiar directo de los organizadores

## Compra de Tickets

Al comprar tickets aceptas lo siguiente:

- Cada ticket purchased representa una entrada válida para el sorteo
- Los tickets no son reembolsables una vez comprado
- El precio del ticket es de 0,50 € por unidad
- Puedes comprar múltiples tickets para aumentar tus probabilidades
- Los tickets purchased se confirmarán mediante email

## Selección del Ganador

El ganador del sorteo será seleccionado de forma completamente aleatoria utilizando un sistema de selección aleatoria certificado. El proceso se realizará en directo y se publicará en nuestras redes sociales.

- Se seleccionará un (1) ganador principal
- El ganador será contactado por email en un plazo de 48 horas
- Si el ganador no responde en 7 días, se seleccionará un nuevo ganador
- La decisión es final y no admite apelación

## Pago y Procesamiento

Los pagos son procesados por Stripe, nuestro proveedor de servicios de pago externo. GR Cup no almacena datos de tu tarjeta de crédito o débito. Al realizar una compra, aceptas los términos y condiciones de Stripe.

## Entrega del Premio

Una vez confirmado el ganador, nos pondremos en contacto para coordinar la entrega del premio. El premio es intransferible y no puede canjearse por dinero en efectivo. Los costes de envío o recogida varierán según la ubicación del ganador.

## Limitación de Responsabilidad

GR Strength no será responsable de cualquier pérdida, daño o inconveniente causado por la participación en el sorteo, excepto en случаях de negligencia grave o incumplimiento contractual. Nuestra responsabilidad total no excederá en ningún caso el valor del ticket purchased.

## Modificaciones

GR Strength se reserva el derecho de modificar estos términos en cualquier momento. Los cambios significativos serán comunicados mediante email a los participantes. La participación continuada tras los cambios implica la aceptación de los nuevos términos.

## Ley Aplicable

Estos Términos de Servicio se rigen por las leyes de España. Cualquier controversia derivada de estos términos será resuelta en los tribunales competentes de España.

## Contacto

Si tienes preguntas sobre estos Términos de Servicio, contacta con nosotros:

admin@grstrength.com$txt$),
  ('consentimiento', 'Consentimiento de Datos', $txt$## Información sobre el Tratamiento de Datos

En cumplimiento del Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), te informamos sobre cómo tratamos tus datos personales.

GR Strength, como responsable del tratamiento, necesita tu consentimiento explícito para recopilar y procesar tus datos personales con la finalidad de participar en el sorteo del GR Cup 2026.

## Responsable del Tratamiento

GR Strength Sitio web: https://www.grteam.net Email de contacto: admin@grstrength.com

## Datos Personales que Recopilamos

Con tu consentimiento, recopilamos los siguientes datos personales:

- Nombre completo: Para identificarte como participante y, en caso de ganar, para hacer efectivo el premio
- Correo electrónico: Para enviarte la confirmación de tu participación y notificaciones importantes sobre el sorteo
- Número de teléfono: Para contactarte en caso de resultar ganador
- Confirmación de seguimiento en Instagram: Para verificar el cumplimiento de los requisitos de participación
- Cantidad de tickets purchased: Para procesar tu participación en el sorteo

## Finalidad del Tratamiento

Tratamos tus datos personales con las siguientes finalidades:

- Gestionar tu inscripción y participación en el sorteo del GR Cup 2026
- Procesar el pago de los tickets adquiridos a través de Stripe
- Enviar confirmaciones de compra y actualizaciones sobre el estado del sorteo
- Contactar al ganador para organizar la entrega del premio
- Cumplir con las obligaciones legales aplicables en materia fiscal y de consumo

## Base Legal del Tratamiento

El tratamiento de tus datos personales se realiza bajo la siguiente base legal:

- Tu consentimiento explícito (Art. 6.1.a RGPD): Al marcar la casilla de aceptación de este consentimiento, autorizas expresamente a GR Strength a tratar tus datos personales para los fines descritos.

El suministro de datos es voluntary, pero necesario para participar en el sorteo. Si no proporcionas los datos requeridos, no podrás participar en el sorteo del GR Cup 2026.

## Destinatarios de los Datos

Tus datos personales pueden ser comunicados a los siguientes terceros:

- Stripe: Para el procesamiento de pagos. Los datos de tu tarjeta de crédito/débito son tratados directamente por Stripe bajo su propia política de privacidad.
- Proveedores de servicios técnicos: Empresas que nos ayudan a operar nuestro sitio web y sistemas de manera segura.
- Autoridades legales: Cuando sea requerido por ley o para proteger nuestros derechos legales.

No vendemos, alquilamos ni cedemos tus datos personales a terceros con fines de marketing.

## Plazo de Conservación

Conservamos tus datos personales durante el tiempo necesario para cumplir con los fines para los que fueron recopilados. Concretamente:

- Datos de participantes: Se eliminarán 30 días después de la celebración del sorteo, salvo los datos del ganador que se conservan durante 5 años para cumplimiento fiscal.
- Datos de pago: Conservamos los registros de transacción durante el periodo requerido por la normativa fiscal española (mínimo 5 años).

## Tus Derechos

Tienes los siguientes derechos sobre tus datos personales:

- Acceso: Obtener confirmación de si estamos tratando tus datos y acceder a los mismos.
- Rectificación: Corregir datos inexactos o incompletos.
- Supresión: Solicitar la eliminación de tus datos cuando ya no sean necesarios para los fines最初的.
- Limitación: Solicitar que limitemos el tratamiento de tus datos en determinadas circunstancias.
- Oposición: Oponerte al tratamiento de tus datos.
- Portabilidad: Recibir tus datos en un formato estructurado y transferirlos a otro responsable.
- Revocación: Retirar tu consentimiento en cualquier momento, sin afectar a la licitud del tratamiento previo.

Para ejercer cualquiera de estos derechos, contacta con nosotros en admin@grstrength.com. Responderemos a tu solicitud en el plazo máximo de un mes.

## Medidas de Seguridad

Implementamos medidas de seguridad técnicas y organizativa apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Estas medidas incluyen:

- Cifrado de datos en tránsito mediante TLS/SSL
- Acceso restringido a datos personales solo para personal autorizado
- Monitoreo continuo de nuestros sistemas para detectar vulnerabilidades
- Respaldo periódico de datos

## Transferencias Internacionales

Certains de nuestros proveedores de servicios (como Stripe) pueden transferir tus datos a países fuera del Espacio Económico Europeo (EEE). En tales casos, nos aseguramos de que existen garantías adecuadas, como cláusulas contractuales tipo aprobadas por la Comisión Europea.

## Derecho a Reclamar

Sin perjuicio de cualquier otro recurso administrativo o judicial, tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) si consideras que el tratamiento de tus datos personales vulnera la normativa de protección de datos.

Más información: https://www.aepd.es

## Contacto

Si tienes preguntas sobre este Consentimiento de Datos o sobre cómo tratamos tus datos personales, contacta con nosotros:

admin@grstrength.com$txt$),
  ('bases-sorteo', 'Política del Concurso', $txt$## Aceptación de las Bases

Al participar en el sorteo del GR Cup 2026, aceptas íntegramente estas bases y condiciones. Si no estás de acuerdo con alguno de los términos aquí establecidos, por favor no participes en el sorteo. La participación implica la aceptación penuh de estas condiciones.

## Organizador del Concurso

El sorteo del GR Cup 2026 está organizado por GR Strength, con domicilio en España y dirección de contacto admin@grstrength.com.

## Periodo de Participación

El periodo de participación en el sorteo del GR Cup 2026 comprende desde la fecha de inicio hasta la fecha de cierre indicadas en la página oficial del sorteo. Las fechas específicas serán comunicadas a través de:

- La página web oficial del sorteo
- Las redes sociales de GR Strength (Instagram: @grstrength)
- Comunicados por correo electrónico a los participantes registrados

## Elegibilidad para Participar

Requisitos obligatorios:

- Tener al menos 18 años de edad en el momento de la participación
- Disponer de un documento de identidad válido (DNI, NIE, pasaporte o equivalente)
- Tener capacidad legal para celebrar contratos
- Proporcionar información veraz, completa y actualizada durante el registro
- Disponer de una cuenta de correo electrónico válida
- Disponer de un número de teléfono móvil para recibir notificaciones

Requisitos adicionales para ser elegible:

- Seguir la cuenta oficial de Instagram de GR Strength (@grstrength) durante todo el periodo del sorteo
- Completar correctamente todos los campos del formulario de inscripción
- Aceptar el presente política del concurso
- Aceptar el tratamiento de sus datos personales conforme al consentimiento informado

No pueden participar: Empleados de GR Strength ni sus familiares directos (hasta primer grado de consanguinidad o afinidad), ni personas involucradas en la organización técnica del sorteo.

## Precio y Compra de Tickets

Cada ticket de participación tiene un precio de 0,50 € (cincuenta céntimos de euro), IVA incluido.

- Puedes comprar tantos tickets como desees para aumentar tus probabilidades de ganar
- Cada ticket purchased genera una entrada única en el sorteo
- Los tickets no son transferibles ni canjeables por dinero en efectivo
- Los tickets no son reembolsables una vez completada la compra
- El pago se realiza exclusivamente a través de Stripe Checkout con tarjeta de crédito o débito
- Métodos de pago aceptados: Visa, Mastercard, American Express, y otros según disponibilidad de Stripe

La compra de tickets se confirmará mediante un correo electrónico de confirmación enviado a la dirección proporcionada durante el registro.

## Premio

El premio del sorteo del GR Cup 2026 consiste en:

- [Descripción del premio] - Un cinturón SBD de alta calidad
- El premio es intransferible
- El premio no puede canjearse por dinero en efectivo o cualquier otro producto
- GR Strength se reserva el derecho de substituir el premio por otro de valor equivalente en caso de indisponibilidad

El valor total del premio no excederá los 500 €.

## Selección del Ganador

El ganador del sorteo será seleccionado mediante selección aleatoria pura utilizando un sistema de generación de números aleatorios certificado.

- Se realizará un único sorteo para determinar al ganador del premio principal
- El sorteo se realizará en la fecha indicada, públicamente a través de redes sociales
- El proceso de selección será grabado en video para garantizar la transparencia
- Se generará un registro digital del resultado del sorteo

Probabilidades de ganar: Las probabilidades de ganar son proporcionales al número de tickets purchased. Si compras 1 ticket de un total de 100 tickets vendidos, tu probabilidad de ganar es de 1%.

## Notificación y Entrega del Premio

El ganador será notificado de la siguiente manera:

- Correo electrónico: Se enviará un email a la dirección proporcionada durante la compra
- Publicación en redes sociales: Se anunciará el ganador (solo el nombre de pila) en Instagram y en la web oficial
- Plazo de respuesta: El ganador dispone de 7 días naturales para responder y confirmar sus datos

Si el ganador no responde en el plazo indicado, no es elegible, o renuncia al premio, se procederá a seleccionar un ganador alternativo siguiendo el mismo procedimiento aleatorio.

La entrega del premio se coordinará directamente con el ganador. Los costes de envío corren a cargo de GR Strength para destinos en España. Para destinos internacionales, pueden aplicarse costes adicionales de envío que serán comunicados previamente.

## Prevención de Fraude

GR Strength se compromete a garantizar la integridad del sorteo. Está estrictamente prohibido:

- Utilizar cuentas de Instagram falsas o múltiplos para inflar las probabilidades
- Proporcionar información falsa o identidad ajena durante el registro
- Realizar compras de tickets mediante tarjetas de crédito robadas o fraudulentas
- Manipular el proceso de selección del ganador
- Cualquier otra acción que infrinja la legislación vigente

Consecuencias: Si se detecta cualquier intento de fraude, GR Strength se reserva el derecho de disqualificar al participante infractor, cancelar sus tickets sin reembolso, y emprender las acciones legales pertinentes.

## Limitación de Responsabilidad

GR Strength no será responsable de:

- Fallos técnicos, errores de software o硬件 que puedan afectar al proceso de compra o al sorteo
- Inscripciones perdidas, retrasadas, incompletas o defectuosas por causas técnicas
- Interrupciones del servicio de Internet o de la plataforma de pago
- Datos proporcionados incorrectamente por el participante
- Cualquier daño indirecto, incidental o consequential derivados de la participación en el sorteo

La responsabilidad total de GR Strength en relación con este sorteo no excederá, en ningún caso, el valor total de los tickets purchased por el participante afectado.

## Modificaciones y Cancelación

GR Strength se reserva el derecho de:

- Modificar estas bases: Cualquier cambio será comunicado con antelación razonable a través de la página web y correo electrónico a los participantes registrados
- Cancelar el sorteo: En caso de circunstancias imprevistas, fuerza mayor, o problemas técnicos graves, GR Strength puede cancelar el sorteo. En tal caso, se reembolsará el importe de los tickets purchased a todos los participantes
- Suspender temporalmente: El sorteo puede ser suspendido temporalmente para resolver problemas técnicos

La participación continuada tras la comunicación de modificaciones implica la aceptación de las nuevas bases.

## Ley Aplicable y Jurisdicción

Este concurso se rige por las leyes de España.

Para cualquier controversia derivada de la interpretación o ejecución de estas bases, las partes se someten a los tribunales competentes de España, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.

Antes de iniciar cualquier acción legal, el participante se compromete a contactar con GR Strength para intentar resolver cualquier dispute de manera amistosa.

## Información sobre el Premio y DISCLAIMER

El premio se describe en la sección 6 de este documento. Las imágenes utilizadas en el material promocional son orientativas y pueden no corresponder exactamente con el premio real.

GR Strength no ofrece ninguna garantía, explícita o implícita, sobre el premio, incluyendo garantías de comerciabilidad o idoneidad para un propósito particular.

## Contacto

Si tienes preguntas sobre esta Política del Concurso, contacta con nosotros:

admin@grstrength.com$txt$)
) AS v(tipo, titulo, contenido)
ON CONFLICT (competition_id, tipo, version) DO NOTHING;

-- +goose Down
-- the unpublished versions are not restored (their publication date is lost); the Figma texts stay.
SELECT 1;

