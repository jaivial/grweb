-- +goose Up
-- English translation of the current CMS content. Idempotent: only fills rows whose en object is still empty.
-- Rows are matched by stable natural keys, so it works on any environment.

UPDATE secciones s SET
  en_publicado = CASE WHEN s.en_publicado = '{}' THEN v.en::jsonb ELSE s.en_publicado END,
  en_borrador = CASE WHEN s.en_borrador = '{}' THEN v.en::jsonb ELSE s.en_borrador END
FROM (VALUES
('home', 'hero', $j$ {"titulo": "WHATEVER IT TAKES"}$j$),
('home', 'campeonato', $j$ {"titulo": "Powerlifting championship"}$j$),
('home', 'cifras', $j$ {"items": [{"etiqueta": "Athletes competing"}, {"etiqueta": "Weight classes"}, {"etiqueta": "Lifts: S · B · D"}, {"etiqueta": "Official referees"}]}$j$),
('home', 'alta-atleta', $j$ {"cta": "Register my athlete", "texto": "If you are competing at the GR Cup 2026, create your athlete profile: photo, club and personal bests. We review it by hand and it stays private until you choose to publish it from the athlete area.", "titulo": "Create your athlete profile", "eyebrow": "GR Cup 2026 · Athlete registration"}$j$),
('home', 'entradas', $j$ {"texto": "Entry is free, but you need to book: you will receive a QR code by email and walk straight in with no queues. One booking covers you and up to 3 guests.", "puntos": [{"texto": "Your QR code arrives instantly by email and is always available under «My ticket».", "titulo": "Free with booking"}, {"texto": "A single booking for you and your guests. Under-18s get in with it.", "titulo": "Up to 4 people"}, {"texto": "There is a raffle of kit during the event: tickets are cash only at the venue.", "titulo": "On-site raffle"}], "titulo": "Come and see it *live*", "eyebrow": "Free entry · limited capacity"}$j$),
('home', 'atletas', $j$ {"alt": "Athlete competing in powerlifting", "titulo": "*A competition*|built for|the athletes", "eyebrow": "01 · The athletes"}$j$),
('home', 'dia', $j$ {"alt": "Athlete focusing before her attempt", "titulo": "The day when|*all the hard work*|pays off", "eyebrow": "02 · Competition day"}$j$),
('home', 'premios', $j$ {"lema": "Show who rules every lift!", "items": [{"titulo": "Squat"}, {"titulo": "Bench press"}, {"titulo": "Deadlift"}], "titulo": "Prizes for the best in *every lift*", "eyebrow": "02 · Prizes"}$j$),
('home', 'organizacion', $j$ {"texto": "A competition designed to offer the best experience to athletes and coaches alike, with certified referees and top-class equipment.", "titulo": "*Organisation* and equipment", "eyebrow": "03 · The competition", "imagenes": [{"alt": "Competition platform with spectators", "texto": "AEP-certified referees and loaders with elite professional equipment", "titulo": "AEP professionalism"}, {"alt": "Coach hugging his athlete", "texto": "A set-up designed so every coach can follow their athletes closely", "titulo": "Coaches and athletes"}, {"alt": "Packed stands during the competition", "texto": "Competition platform and rack open to all spectators", "titulo": "Open to the public"}, {"alt": "Athlete focusing in the warm-up session", "texto": "Warm-up sessions where the coach–athlete relationship is key", "titulo": "Warm-up sessions"}]}$j$),
('home', 'afiliaciones', $j$ {"texto2": "Professional equipment from SBD and A7, leading powerlifting brands with international approval.", "titulo": "*Organisers* and affiliations", "eyebrow": "04 · Organised and endorsed by", "titulo2": "Competition *equipment*", "eyebrow2": "Equipment", "tarjetas": [{"texto": "Affiliated to the Spanish Powerlifting Association (AEP). Official referees ensure the rules are upheld on every attempt."}, {"texto": "Organised by the GRStrength club, it brings the powerlifting community together at a highly competitive event."}]}$j$),
('home', 'sorteo', $j$ {"texto": "During the competition we raffle off donated kit and prizes. Tickets are sold at the raffle stand, cash only.", "titulo": "*Kit* raffle at the venue"}$j$),
('home', 'categorias', $j$ {"texto": "Official AEP weight classes for men and women.", "titulo": "Weight *classes*", "eyebrow": "05 · Competition", "ctaTexto": "To qualify for other AEP competitions (official PDF).", "ctaTitulo": "Check the qualifying totals"}$j$),
('home', 'horarios', $j$ {"titulo": "Schedule", "eyebrow": "06 · Programme"}$j$),
('home', 'localizacion', $j$ {"texto": "Pabellón Municipal de Almussafes (Valencia).", "titulo": "Location", "eyebrow": "07 · Venue", "imagenes": [{"alt": "Entrance to the Almussafes sports hall"}, {"alt": "Sports hall stands"}, {"alt": "Sports hall facilities"}, {"alt": "Main court of the sports hall"}]}$j$),
('home', 'faq', $j$ {"titulo": "Everything you *need to know*", "eyebrow": "08 · Frequently asked questions"}$j$),
('home', 'patrocinadores', $j$ {"titulo": "Sponsors and partners"}$j$),
('publico', 'intro', $j$ {"texto": "The platform is open to the public. Here is what you will see, how an attempt is judged and how to follow it from the stands.", "titulo": "Come and watch", "eyebrow": "Come and see it", "tituloAcento": "the competition"}$j$),
('publico', 'datos', $j$ {"items": [{"valor": "Free with booking", "etiqueta": "Entry"}, {"valor": "By flight", "etiqueta": "Times"}, {"etiqueta": "Venue"}, {"valor": "600 per session (example)", "etiqueta": "Capacity"}]}$j$),
('publico', 'movimientos', $j$ {"items": [{"alt": "Squat on the platform, with the loaders on either side", "titulo": "Squat"}, {"alt": "Athlete on the bench press beneath the competition banner", "titulo": "Bench press"}, {"alt": "Deadlift locked out under the stage lights", "titulo": "Deadlift"}], "texto": "Each flight competes in the squat, then the bench press and finally the deadlift, with three attempts per athlete.", "titulo": "Three", "eyebrow": "01 · What you will see", "tituloAcento": "lifts"}$j$),
('publico', 'juicio', $j$ {"pasos": [{"texto": "The name, attempt and weight are announced on the scoreboard.", "titulo": "The athlete calls their weight"}, {"texto": "They check the weight and the collars.", "titulo": "The loaders set up the bar"}, {"texto": "«Squat», «Press», «Down»… the athlete waits for each command.", "titulo": "Referee commands"}, {"texto": "Good lift with at least 2 out of 3 white lights.", "titulo": "Lights"}], "titulo": "Follow an attempt", "eyebrow": "02 · How it is judged", "tituloAcento": "step by step"}$j$),
('publico', 'normas', $j$ {"items": [{"texto": "Cheer as much as you like, but keep quiet while the athlete sets up for the attempt."}, {"texto": "Do not enter the warm-up area or the platform."}, {"texto": "Photos and video without flash."}, {"texto": "Keep corridors and emergency exits clear."}], "titulo": "In the", "eyebrow": "03 · Rules", "tituloAcento": "stands"}$j$),
('publico', 'interesar', $j$ {"items": [{"texto": "Almussafes sports hall", "titulo": "Getting there"}, {"texto": "Flights by category", "titulo": "Schedule"}, {"texto": "If you cannot make it", "titulo": "Live"}], "titulo": "You may also like"}$j$)
) AS v(pagina, clave, en)
WHERE s.pagina = v.pagina AND s.clave = v.clave AND (s.en_publicado = '{}' OR s.en_borrador = '{}');

UPDATE faq f SET en = v.en::jsonb
FROM (VALUES
('¿Dónde se celebra la competición?', $j$ {"categoria": "Getting there", "pregunta": "Where is the competition held?", "respuesta": "At the Pabellón Municipal de Almussafes (Avda. Laura Méndez s/n, 46440 Almussafes, Valencia). The Location section has the map and a link to Google Maps."}$j$),
('¿Cómo completo mi ficha de atleta?', $j$ {"categoria": "Athletes", "pregunta": "How do I complete my athlete profile?", "respuesta": "Fill in the [athlete registration form](/alta-atleta) with your name, the email you used to register with the AEP, your club and your personal bests. Add a photo if you like: it is published in black and white and cropped. The team reviews every application by hand and, once approved, your profile appears in the [athlete list](/atletas)."}$j$),
('¿Cómo participo en la GRS Cup 2?', $j$ {"categoria": "Competition", "pregunta": "How do I take part in the GRS Cup 2?", "respuesta": "Entries and the waiting list are managed by the **AEP** and the line-up is full. If you are competing in this edition, all you need is your profile: [register your athlete](/alta-atleta) and we will review it by hand."}$j$),
('¿Qué categorías de peso hay?', $j$ {"categoria": "Competition", "pregunta": "What weight classes are there?", "respuesta": "The official AEP weight classes for men and women. See the [weight classes](/categorias-de-peso) page."}$j$),
('¿Necesito una marca mínima?', $j$ {"categoria": "Competition", "pregunta": "Do I need a qualifying total?", "respuesta": "No qualifying total is required for this competition. The [qualifying totals](/marcas-minimas) are used to qualify for other AEP competitions."}$j$),
('¿Puede venir público? ¿Cuánto cuesta?', $j$ {"categoria": "Tickets", "pregunta": "Can spectators come? How much does it cost?", "respuesta": "Yes. Entry is **free**, but you need to book so we can manage capacity: you will receive a QR code by email for you and up to 3 guests."}$j$),
('¿Cómo funciona la rifa?', $j$ {"categoria": "Raffle", "pregunta": "How does the raffle work?", "respuesta": "The raffle takes place on site: tickets are bought in cash at the raffle stand during the event. There are no online sales. See the prizes on the [raffle page](/sorteo)."}$j$),
('¿Cuántas personas puedo incluir en una reserva?', $j$ {"categoria": "Tickets", "pregunta": "How many people can I include in one booking?", "respuesta": "Up to 4 people per booking (you and 3 guests). Under-18s get in with an adult's booking."}$j$),
('¿Puedo entrar y salir del pabellón?', $j$ {"categoria": "Tickets", "pregunta": "Can I leave and re-enter the sports hall?", "respuesta": "Yes, keep your QR code on your phone: you can show it again at the door."}$j$),
('¿Hay aparcamiento?', $j$ {"categoria": "Getting there", "pregunta": "Is there parking?", "respuesta": "Yes, there is parking next to the sports hall."}$j$)
) AS v(pregunta, en)
WHERE f.pregunta = v.pregunta AND f.en = '{}';

UPDATE seo s SET en = v.en::jsonb
FROM (VALUES
('/publico', $j$ {"title": "Watch the competition · GRS Cup 2", "description": "Free entry with booking: what you will see, how an attempt is judged and the rules in the stands in Almussafes."}$j$),
('/clubs', $j$ {"title": "Powerlifting clubs in Valencia · GRS Cup 2", "description": "Clubs and gyms in the Valencian Community, Murcia and the Balearic Islands where you can train powerlifting."}$j$),
('/alta-atleta', $j$ {"title": "Powerlifting athlete registration | GRS Cup 2", "description": "Register as a GRS Cup 2 athlete: create your profile, upload your photo and your AEP bests, and compete with your profile ready for weigh-in."}$j$)
) AS v(ruta, en)
WHERE s.ruta = v.ruta AND s.en = '{}';

UPDATE albumes SET en = $j$ {"titulo": "GR Cup 2025", "fotos": [{"alt": "Athlete in front of the bar before her deadlift"}, {"alt": "Athlete focusing with headphones before her attempt"}, {"alt": "Squat on the platform, with the loaders on either side"}, {"alt": "Athlete on the bench press beneath the competition banner"}, {"alt": "Deadlift locked out under the stage lights"}, {"alt": "Belt and wrist wraps hanging from a bar in the warm-up area"}, {"alt": "A teammate adjusts an athlete's belt before he goes out"}, {"alt": "Athlete focusing before stepping onto the platform"}]}$j$::jsonb
WHERE slug = 'gr-cup-2025' AND en = '{}';

UPDATE paginas p SET en = v.en::jsonb
FROM (VALUES
('pagina', 'reglamento', $j$ {"titulo": "Powerlifting rules", "resumen": "AEP levels, attempts and referees, the three lifts and raw equipment."}$j$),
('pagina', 'categorias-de-peso', $j$ {"titulo": "Weight and age classes", "resumen": "The 18 AEP weight classes, the age divisions and the weigh-in."}$j$),
('pagina', 'marcas-minimas', $j$ {"titulo": "AEP-1 qualifying totals", "resumen": "AEP-1 minimum totals by weight class and division, and how they are achieved."}$j$),
('blog', 'abren-las-reservas', $j$ {"titulo": "Ticket bookings are now open", "resumen": "Entry is free with booking: here is how it works.", "cuerpo": "You can now book your free ticket for the GRS Cup 2."}$j$)
) AS v(tipo, slug, en)
WHERE p.tipo = v.tipo AND p.slug = v.slug AND p.en = '{}';

UPDATE legal SET en = $j$ {"titulo": "Cookie policy", "contenido": "> **Sample data.** Provisional text pending review by the legal advisers before the website goes live.\n\nWe only use technical cookies that are necessary for the website and the back-office session to work."}$j$::jsonb
WHERE tipo = 'cookies' AND version = '2026-04' AND en = '{}';

UPDATE legal SET en = jsonb_build_object('titulo', 'Terms of Service', 'contenido', $t$## Acceptance of the Terms

By accessing and taking part in the GRS Cup 2 raffle, you accept these Terms of Service in full. If you do not agree with any of these terms, please do not take part in the raffle.

## The Raffle

The GRS Cup 2 is a raffle organised by GR Strength. Each ticket costs €0.50 (fifty euro cents).

- The prize consists of powerlifting-related products and experiences
- The draw will be made at random
- The funds raised go towards covering the costs of the event and the prizes

## Eligibility

To take part in the raffle you must:

- Be at least 18 years old
- Provide truthful and complete information when purchasing
- Have a valid payment method
- Not be employed by GR Strength or be an immediate family member of the organisers

## Ticket Purchase

By purchasing tickets you agree to the following:

- Each ticket purchased represents one valid entry into the raffle
- Tickets are non-refundable once purchased
- The ticket price is €0.50 each
- You may buy multiple tickets to increase your chances
- Purchased tickets will be confirmed by email

## Winner Selection

The raffle winner will be selected completely at random using a certified random selection system. The draw will take place live and will be published on our social media.

- One (1) main winner will be selected
- The winner will be contacted by email within 48 hours
- If the winner does not respond within 7 days, a new winner will be selected
- The decision is final and not open to appeal

## Payment and Processing

Payments are processed by Stripe, our external payment service provider. GRS Cup 2 does not store your credit or debit card details. By making a purchase, you accept Stripe's terms and conditions.

## Prize Delivery

Once the winner has been confirmed, we will get in touch to arrange delivery of the prize. The prize is non-transferable and cannot be exchanged for cash. Shipping or collection costs will vary depending on the winner's location.

## Limitation of Liability

GR Strength will not be liable for any loss, damage or inconvenience caused by taking part in the raffle, except in cases of gross negligence or breach of contract. Our total liability shall under no circumstances exceed the value of the ticket purchased.

## Changes

GR Strength reserves the right to amend these terms at any time. Significant changes will be communicated to participants by email. Continued participation after the changes implies acceptance of the new terms.

## Governing Law

These Terms of Service are governed by the laws of Spain. Any dispute arising from these terms will be resolved by the competent courts of Spain.

## Contact

If you have any questions about these Terms of Service, please contact us:

admin@grstrength.com$t$)
WHERE tipo = 'terminos' AND version = '2026.11' AND en = '{}';

UPDATE legal SET en = jsonb_build_object('titulo', 'Privacy Policy', 'contenido', $t$## Data Controller

GR Strength Website: https://www.grteam.net Contact email: admin@grstrength.com

## Data We Collect

We only collect the data needed to take part in the GRS Cup 2 raffle:

- Email: to send purchase confirmations and raffle notifications
- First name and surname: to identify the prize winner
- Instagram: for follow-up and communication with participants (optional)
- Payment details: processed directly by Stripe; we do not store card details

## Purpose of Processing

We use your data exclusively to:

- Process your raffle ticket purchase
- Send confirmations and updates about the raffle
- Contact the winner to arrange delivery of the prize
- Comply with applicable legal obligations

## Payment Processing

All payments are processed by Stripe, a PCI-DSS certified external payment provider. GRS Cup 2 does not store any credit or debit card details. Payment data is transferred securely and directly between your bank and Stripe.

## Data Retention

We keep your personal data for as long as necessary to complete the raffle and meet our legal obligations. Participants' data is deleted 30 days after the draw, except for the winner's data, which is kept for tax compliance.

## Your Rights

You have the following rights over your personal data:

- Access: request a copy of your data
- Rectification: correct inaccurate data
- Erasure: request the deletion of your data
- Objection: object to processing
- Portability: receive your data in a structured format

To exercise any of these rights, contact us at admin@grstrength.com.

## Cookies

We do not use tracking or advertising cookies. Our site only uses essential technical cookies for the shopping basket and the payment process, which are necessary to provide the service requested.

## Security

We implement appropriate technical and organisational security measures to protect your personal data against unauthorised access, alteration, disclosure or destruction. All communication with our site is encrypted using TLS/SSL.

## Changes to this Policy

We may update this Privacy Policy from time to time. Any changes will be published on this page with a revised "last updated" date. We recommend reviewing this policy regularly.

## Contact

If you have any questions about this Privacy Policy, please contact us:

admin@grstrength.com

## Source of athlete data

Athlete profile data (name, club, class, bests, photo and competition schedule) comes exclusively from the registration and voluntary disclosure each athlete makes when signing up on this website. We do not obtain it from the Spanish Powerlifting Association (AEP) or from any other federation or third party.

The profile is private until the athlete chooses to publish it from the athlete area. You can edit your data, hide your profile or request its deletion at any time from the athlete area or by writing to admin@grstrength.com.$t$)
WHERE tipo = 'privacidad' AND version = '2026.11' AND en = '{}';

UPDATE legal SET en = jsonb_build_object('titulo', 'Data Consent', 'contenido', $t$## Information on Data Processing

In accordance with the General Data Protection Regulation (GDPR) and Spanish Organic Law 3/2018 on the Protection of Personal Data and the Guarantee of Digital Rights (LOPDGDD), we inform you of how we process your personal data.

GR Strength, as data controller, needs your explicit consent to collect and process your personal data for the purpose of taking part in the GRS Cup 2 raffle.

## Data Controller

GR Strength Website: https://www.grteam.net Contact email: admin@grstrength.com

## Personal Data We Collect

With your consent, we collect the following personal data:

- Full name: to identify you as a participant and, should you win, to award the prize
- Email address: to send you confirmation of your entry and important notifications about the raffle
- Phone number: to contact you if you win
- Confirmation that you follow us on Instagram: to verify that the entry requirements are met
- Number of tickets purchased: to process your entry into the raffle

## Purpose of Processing

We process your personal data for the following purposes:

- Managing your registration and participation in the GRS Cup 2 raffle
- Processing payment for the tickets purchased through Stripe
- Sending purchase confirmations and updates on the status of the raffle
- Contacting the winner to arrange delivery of the prize
- Complying with applicable tax and consumer legal obligations

## Legal Basis for Processing

Your personal data is processed on the following legal basis:

- Your explicit consent (Art. 6.1.a GDPR): by ticking the box to accept this consent, you expressly authorise GR Strength to process your personal data for the purposes described.

Providing your data is voluntary but necessary to take part in the raffle. If you do not provide the required data, you will not be able to take part in the GRS Cup 2 raffle.

## Recipients of the Data

Your personal data may be disclosed to the following third parties:

- Stripe: for payment processing. Your credit/debit card details are handled directly by Stripe under its own privacy policy.
- Technical service providers: companies that help us operate our website and systems securely.
- Legal authorities: when required by law or to protect our legal rights.

We do not sell, rent or transfer your personal data to third parties for marketing purposes.

## Retention Period

We keep your personal data for as long as necessary to fulfil the purposes for which it was collected. Specifically:

- Participant data: deleted 30 days after the draw, except for the winner's data, which is kept for 5 years for tax compliance.
- Payment data: we keep transaction records for the period required by Spanish tax law (at least 5 years).

## Your Rights

You have the following rights over your personal data:

- Access: obtain confirmation of whether we are processing your data and access it.
- Rectification: correct inaccurate or incomplete data.
- Erasure: request the deletion of your data when it is no longer needed for the original purposes.
- Restriction: ask us to restrict the processing of your data in certain circumstances.
- Objection: object to the processing of your data.
- Portability: receive your data in a structured format and transfer it to another controller.
- Withdrawal: withdraw your consent at any time, without affecting the lawfulness of prior processing.

To exercise any of these rights, contact us at admin@grstrength.com. We will respond to your request within one month at the latest.

## Security Measures

We implement appropriate technical and organisational security measures to protect your personal data against unauthorised access, alteration, disclosure or destruction. These measures include:

- Encryption of data in transit using TLS/SSL
- Access to personal data restricted to authorised staff only
- Continuous monitoring of our systems to detect vulnerabilities
- Regular data backups

## International Transfers

Some of our service providers (such as Stripe) may transfer your data to countries outside the European Economic Area (EEA). In such cases, we make sure that appropriate safeguards are in place, such as standard contractual clauses approved by the European Commission.

## Right to Complain

Without prejudice to any other administrative or judicial remedy, you have the right to lodge a complaint with the Spanish Data Protection Agency (AEPD) if you believe that the processing of your personal data breaches data protection law.

More information: https://www.aepd.es

## Contact

If you have any questions about this Data Consent or about how we process your personal data, please contact us:

admin@grstrength.com

## Source of athlete data

Athlete profile data (name, club, class, bests, photo and competition schedule) comes exclusively from the registration and voluntary disclosure each athlete makes when signing up on this website. We do not obtain it from the Spanish Powerlifting Association (AEP) or from any other federation or third party.

The profile is private until the athlete chooses to publish it from the athlete area. You can edit your data, hide your profile or request its deletion at any time from the athlete area or by writing to admin@grstrength.com.$t$)
WHERE tipo = 'consentimiento' AND version = '2026.11' AND en = '{}';

UPDATE legal SET en = jsonb_build_object('titulo', 'Contest Policy', 'contenido', $t$## Acceptance of the Rules

By taking part in the GRS Cup 2 raffle, you accept these rules and conditions in full. If you do not agree with any of the terms set out here, please do not take part in the raffle. Taking part implies full acceptance of these conditions.

## Contest Organiser

The GRS Cup 2 raffle is organised by GR Strength, based in Spain, with the contact address admin@grstrength.com.

## Entry Period

The entry period for the GRS Cup 2 raffle runs from the start date to the closing date shown on the official raffle page. The specific dates will be announced through:

- The official raffle website
- GR Strength's social media (Instagram: @grstrength)
- Emails to registered participants

## Eligibility

Mandatory requirements:

- Be at least 18 years old at the time of entry
- Hold a valid identity document (DNI, NIE, passport or equivalent)
- Have the legal capacity to enter into contracts
- Provide truthful, complete and up-to-date information when registering
- Have a valid email account
- Have a mobile phone number to receive notifications

Additional eligibility requirements:

- Follow GR Strength's official Instagram account (@grstrength) throughout the raffle period
- Correctly complete every field of the entry form
- Accept this contest policy
- Accept the processing of your personal data in line with the informed consent

Not eligible: GR Strength employees or their immediate family (up to first-degree relatives by blood or marriage), or anyone involved in the technical organisation of the raffle.

## Ticket Price and Purchase

Each entry ticket costs €0.50 (fifty euro cents), VAT included.

- You can buy as many tickets as you like to increase your chances of winning
- Each ticket purchased generates a single entry into the raffle
- Tickets are non-transferable and cannot be exchanged for cash
- Tickets are non-refundable once the purchase is complete
- Payment is made exclusively through Stripe Checkout by credit or debit card
- Accepted payment methods: Visa, Mastercard, American Express and others depending on Stripe availability

Your ticket purchase will be confirmed by an email sent to the address provided when registering.

## Prize

The GRS Cup 2 raffle prize consists of:

- [Prize description] - A high-quality SBD belt
- The prize is non-transferable
- The prize cannot be exchanged for cash or any other product
- GR Strength reserves the right to replace the prize with another of equivalent value if it becomes unavailable

The total value of the prize will not exceed €500.

## Winner Selection

The raffle winner will be chosen by purely random selection using a certified random number generation system.

- A single draw will be held to determine the winner of the main prize
- The draw will take place on the date announced, publicly through social media
- The selection process will be recorded on video to ensure transparency
- A digital record of the draw result will be generated

Odds of winning: the odds of winning are proportional to the number of tickets purchased. If you buy 1 ticket out of a total of 100 tickets sold, your chance of winning is 1%.

## Notification and Prize Delivery

The winner will be notified as follows:

- Email: an email will be sent to the address provided at purchase
- Social media announcement: the winner (first name only) will be announced on Instagram and on the official website
- Response deadline: the winner has 7 calendar days to respond and confirm their details

If the winner does not respond within the stated period, is not eligible or declines the prize, an alternative winner will be selected following the same random procedure.

Prize delivery will be arranged directly with the winner. Shipping costs are covered by GR Strength for destinations in Spain. For international destinations, additional shipping costs may apply, which will be communicated in advance.

## Fraud Prevention

GR Strength is committed to ensuring the integrity of the raffle. The following is strictly prohibited:

- Using fake or multiple Instagram accounts to inflate your chances
- Providing false information or another person's identity when registering
- Buying tickets with stolen or fraudulent credit cards
- Tampering with the winner selection process
- Any other action that breaches current legislation

Consequences: if any attempted fraud is detected, GR Strength reserves the right to disqualify the offending participant, cancel their tickets without refund and take appropriate legal action.

## Limitation of Liability

GR Strength will not be liable for:

- Technical failures or software or hardware errors that may affect the purchase process or the draw
- Lost, delayed, incomplete or defective entries due to technical reasons
- Interruptions to the Internet service or the payment platform
- Incorrect data provided by the participant
- Any indirect, incidental or consequential damage arising from taking part in the raffle

GR Strength's total liability in relation to this raffle shall under no circumstances exceed the total value of the tickets purchased by the affected participant.

## Changes and Cancellation

GR Strength reserves the right to:

- Amend these rules: any change will be communicated with reasonable notice on the website and by email to registered participants
- Cancel the raffle: in the event of unforeseen circumstances, force majeure or serious technical problems, GR Strength may cancel the raffle. In that case, the amount paid for tickets will be refunded to all participants
- Suspend it temporarily: the raffle may be temporarily suspended to resolve technical problems

Continued participation after changes have been communicated implies acceptance of the new rules.

## Governing Law and Jurisdiction

This contest is governed by the laws of Spain.

For any dispute arising from the interpretation or performance of these rules, the parties submit to the competent courts of Spain, expressly waiving any other jurisdiction that may apply to them.

Before taking any legal action, the participant agrees to contact GR Strength to try to resolve any dispute amicably.

## Prize Information and DISCLAIMER

The prize is described in section 6 of this document. The images used in promotional material are for guidance only and may not correspond exactly to the actual prize.

GR Strength gives no warranty, express or implied, regarding the prize, including warranties of merchantability or fitness for a particular purpose.

## Contact

If you have any questions about this Contest Policy, please contact us:

admin@grstrength.com$t$)
WHERE tipo = 'bases-sorteo' AND version = '2026.11' AND en = '{}';

-- +goose Down
SELECT 1;
