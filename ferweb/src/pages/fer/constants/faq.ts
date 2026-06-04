export type FaqAnswerBlock =
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'list';
      items: string[];
    };

export interface FaqItem {
  question: string;
  answer: FaqAnswerBlock[];
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: '¿Qué es la FER CUP?',
    answer: [
      {
        type: 'paragraph',
        text: 'La FER CUP es una competición de Powerlifting organizada por GR Strength, pensada para que cualquier atleta pueda vivir una experiencia competitiva real en un entorno cuidado, accesible y bien organizado.',
      },
      {
        type: 'paragraph',
        text: 'El evento contará con jueces, tarima, zona de calentamiento, material de competición, staff, spotters/cargadores y una puesta en escena digna de una competición importante.',
      },
    ],
  },
  {
    question: '¿Dónde se celebra la FER CUP?',
    answer: [
      {
        type: 'paragraph',
        text: 'La FER CUP se celebrará en el Pabellón Municipal de Almussafes, en Valencia.',
      },
      {
        type: 'paragraph',
        text: 'Antes del evento se enviará toda la información necesaria sobre ubicación, horarios, accesos, pesaje y organización general.',
      },
    ],
  },
  {
    question: '¿Cuándo es la competición?',
    answer: [
      {
        type: 'paragraph',
        text: 'La FER CUP se celebrará el 25 de julio.',
      },
      {
        type: 'paragraph',
        text: 'Los horarios definitivos se comunicarán cuando se cierren las inscripciones y se organicen las tandas de competición.',
      },
    ],
  },
  {
    question: '¿Qué modalidades hay?',
    answer: [
      {
        type: 'paragraph',
        text: 'Puedes inscribirte en una de estas tres modalidades:',
      },
      {
        type: 'list',
        items: [
          'Modalidad tradicional: sentadilla, press banca y peso muerto.',
          'Solo banca: únicamente press banca.',
          'Solo peso muerto: únicamente peso muerto.',
        ],
      },
      {
        type: 'paragraph',
        text: 'La idea es que puedas elegir la opción que mejor se adapte a tu nivel, experiencia y objetivos.',
      },
    ],
  },
  {
    question: '¿Necesito haber competido antes?',
    answer: [
      {
        type: 'paragraph',
        text: 'No. De hecho, la FER CUP está pensada especialmente para personas que quieren vivir su primera experiencia competitiva.',
      },
      {
        type: 'paragraph',
        text: 'No necesitas tener experiencia previa ni saber perfectamente cómo funciona una competición. La organización te irá guiando durante el evento.',
      },
    ],
  },
  {
    question: '¿Necesito material de competición?',
    answer: [
      {
        type: 'paragraph',
        text: 'No es obligatorio tener material específico de competición.',
      },
      {
        type: 'paragraph',
        text: 'Puedes participar con ropa deportiva cómoda. Si tienes cinturón, rodilleras, muñequeras o zapatillas específicas, puedes utilizarlas, pero no es imprescindible.',
      },
      {
        type: 'paragraph',
        text: 'Lo importante es que vengas preparado para levantar y disfrutar la experiencia.',
      },
    ],
  },
  {
    question: '¿Qué significa “handler”?',
    answer: [
      {
        type: 'paragraph',
        text: 'El handler es la persona que acompaña y ayuda al atleta durante la competición.',
      },
      {
        type: 'paragraph',
        text: 'Su función puede incluir:',
      },
      {
        type: 'list',
        items: [
          'ayudarte a organizar los calentamientos',
          'controlar los tiempos',
          'orientarte con los intentos',
          'acompañarte antes de salir a tarima',
          'ayudarte a mantener la calma',
          'estar pendiente de lo que necesitas durante el evento',
        ],
      },
      {
        type: 'paragraph',
        text: 'En una competición, el handler es una figura muy útil porque te permite centrarte únicamente en competir.',
      },
    ],
  },
  {
    question: '¿Y si no tengo handler?',
    answer: [
      {
        type: 'paragraph',
        text: 'No pasa nada.',
      },
      {
        type: 'paragraph',
        text: 'Si no tienes entrenador o persona que te acompañe durante la competición, GR Strength podrá ayudarte durante el evento de forma gratuita.',
      },
      {
        type: 'paragraph',
        text: 'Solo tendrás que informarnos previamente para que podamos organizarlo bien.',
      },
    ],
  },
  {
    question: 'Si me inscribo y luego quiero asesoramiento, ¿puedo añadirlo como extra?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'Si después de inscribirte quieres ayuda para preparar la competición, podrás solicitar asesoramiento como extra.',
      },
      {
        type: 'paragraph',
        text: 'La idea es que, si no sabes cómo prepararte o quieres llegar con más seguridad, podamos ayudarte con una preparación orientada específicamente a la FER CUP.',
      },
      {
        type: 'paragraph',
        text: 'Este servicio se podrá añadir tras la inscripción o hablar directamente con la organización.',
      },
    ],
  },
  {
    question: 'Una vez me inscribo, ¿cómo me preparo de cara al evento?',
    answer: [
      {
        type: 'paragraph',
        text: 'Tras inscribirte, recibirás información importante sobre la competición: horarios, ubicación, pesaje, normas básicas, modalidades y funcionamiento general del día.',
      },
      {
        type: 'paragraph',
        text: 'A nivel entrenamiento, lo ideal es que llegues con una idea clara de:',
      },
      {
        type: 'list',
        items: [
          'qué pesos puedes levantar con seguridad',
          'cuáles podrían ser tus intentos',
          'cómo calentar antes de salir a tarima',
          'qué material vas a utilizar',
          'qué modalidad vas a competir',
        ],
      },
      {
        type: 'paragraph',
        text: 'Si tienes entrenador, él podrá ayudarte con todo este proceso.',
      },
      {
        type: 'paragraph',
        text: 'Si no tienes entrenador, podrás solicitar asesoramiento específico para preparar la FER CUP.',
      },
    ],
  },
  {
    question: '¿Cuánto dura la competición?',
    answer: [
      {
        type: 'paragraph',
        text: 'La duración exacta dependerá del número final de inscritos y de las tandas organizadas.',
      },
      {
        type: 'paragraph',
        text: 'La competición se celebrará durante el día 25 de julio, y los horarios definitivos de pesaje, calentamiento y participación se comunicarán una vez cerradas las inscripciones.',
      },
      {
        type: 'paragraph',
        text: 'Nuestro objetivo es que todo esté organizado por grupos y horarios para que la experiencia sea fluida tanto para atletas como para espectadores.',
      },
    ],
  },
  {
    question: '¿Habrá pesaje?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'Habrá pesaje el día del evento en el horario que comunique la organización.',
      },
      {
        type: 'paragraph',
        text: 'El pesaje servirá para organizar correctamente las categorías y el desarrollo de la competición.',
      },
    ],
  },
  {
    question: '¿Cuántos intentos tengo?',
    answer: [
      {
        type: 'paragraph',
        text: 'Depende de la modalidad en la que participes.',
      },
      {
        type: 'paragraph',
        text: 'En la modalidad tradicional tendrás:',
      },
      {
        type: 'list',
        items: [
          '3 intentos de sentadilla',
          '3 intentos de press banca',
          '3 intentos de peso muerto',
        ],
      },
      {
        type: 'paragraph',
        text: 'En las modalidades de solo banca o solo peso muerto, tendrás 3 intentos del movimiento correspondiente.',
      },
    ],
  },
  {
    question: '¿Habrá jueces?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'La FER CUP contará con jueces profesionales con certificación oficial.',
      },
      {
        type: 'paragraph',
        text: 'La idea es que vivas una experiencia lo más parecida posible a una competición real, pero en un entorno accesible, educativo y pensado para disfrutar.',
      },
    ],
  },
  {
    question: '¿Qué pasa si fallo un intento?',
    answer: [
      {
        type: 'paragraph',
        text: 'No pasa nada.',
      },
      {
        type: 'paragraph',
        text: 'Como en cualquier competición de Powerlifting, puedes fallar un intento y seguir compitiendo.',
      },
      {
        type: 'paragraph',
        text: 'Tendrás varios intentos y podrás ajustar la estrategia según cómo vaya el día.',
      },
    ],
  },
  {
    question: '¿Puede venir público a verme?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'La entrada para espectadores será gratuita, salvo que la organización comunique lo contrario.',
      },
      {
        type: 'paragraph',
        text: 'Familiares, amigos y compañeros podrán asistir para animarte y vivir el evento contigo.',
      },
    ],
  },
  {
    question: '¿Puedo ir con mi entrenador?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'Puedes acudir con tu entrenador o handler para que te ayude durante la competición.',
      },
      {
        type: 'paragraph',
        text: 'Más adelante se comunicará cualquier indicación específica sobre acceso a zona de calentamiento, número de acompañantes por atleta y funcionamiento interno.',
      },
    ],
  },
  {
    question: '¿Habrá zona de calentamiento?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'El evento contará con zona de calentamiento equipada para que los atletas puedan prepararse antes de salir a competir.',
      },
    ],
  },
  {
    question: '¿Habrá premios?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'Habrá premios y reconocimientos para los mejores levantadores y/o categorías que determine la organización.',
      },
      {
        type: 'paragraph',
        text: 'Los detalles concretos se comunicarán antes del evento.',
      },
    ],
  },
  {
    question: '¿Habrá merchandising?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'Durante la FER CUP habrá merchandising limitado de GR Strength y/o del evento.',
      },
      {
        type: 'paragraph',
        text: 'La disponibilidad será limitada y se informará previamente a través de la web y redes sociales.',
      },
    ],
  },
  {
    question: '¿Puedo participar aunque no sea de GR Strength o FER Entrenamiento?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'La FER CUP está abierta a atletas externos, socios de FER, afiliados de GR Strength y cualquier persona con ganas de competir.',
      },
      {
        type: 'paragraph',
        text: 'No necesitas pertenecer a ningún club para participar.',
      },
    ],
  },
  {
    question: '¿Es una competición oficial?',
    answer: [
      {
        type: 'paragraph',
        text: 'La FER CUP es una competición organizada por GR Strength con formato competitivo real, jueces, intentos, pesaje y estructura de competición.',
      },
      {
        type: 'paragraph',
        text: 'No obstante, no debe entenderse como un campeonato federativo oficial, salvo que la organización indique expresamente lo contrario.',
      },
    ],
  },
  {
    question: '¿Se publicarán resultados?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'La organización podrá publicar clasificaciones, resultados, fotos y vídeos del evento en la web, redes sociales y canales oficiales de GR Strength.',
      },
    ],
  },
  {
    question: '¿Se harán fotos y vídeos?',
    answer: [
      {
        type: 'paragraph',
        text: 'Sí.',
      },
      {
        type: 'paragraph',
        text: 'Durante el evento se captará contenido audiovisual para documentar la competición.',
      },
      {
        type: 'paragraph',
        text: 'Este contenido podrá utilizarse en redes sociales, web, publicaciones promocionales y material relacionado con GR Strength y futuros eventos.',
      },
    ],
  },
  {
    question: '¿Qué debo llevar el día de la competición?',
    answer: [
      {
        type: 'paragraph',
        text: 'Te recomendamos traer:',
      },
      {
        type: 'list',
        items: [
          'DNI o documento identificativo',
          'ropa deportiva cómoda',
          'zapatillas con las que sueles entrenar',
          'cinturón, rodilleras o muñequeras si las utilizas',
          'comida y bebida para el día',
          'magnesio si sueles usarlo',
          'ganas de competir y disfrutar',
        ],
      },
      {
        type: 'paragraph',
        text: 'Antes del evento se enviará una guía más detallada para atletas.',
      },
    ],
  },
  {
    question: '¿Puedo cambiar de modalidad después de inscribirme?',
    answer: [
      {
        type: 'paragraph',
        text: 'Dependerá del momento en el que solicites el cambio y de la organización de las tandas.',
      },
      {
        type: 'paragraph',
        text: 'Si necesitas cambiar de modalidad, deberás contactar con la organización lo antes posible para valorar si es posible realizar el cambio.',
      },
    ],
  },
  {
    question: '¿Qué pasa si finalmente no puedo asistir?',
    answer: [
      {
        type: 'paragraph',
        text: 'Deberás comunicarlo a la organización lo antes posible a través del canal de contacto indicado en la web.',
      },
      {
        type: 'paragraph',
        text: 'Las condiciones de cancelación o devolución serán las establecidas en los términos y condiciones del evento.',
      },
    ],
  },
  {
    question: '¿Cómo contacto con la organización?',
    answer: [
      {
        type: 'paragraph',
        text: 'Puedes contactar con la organización a través del correo electrónico, formulario o canales oficiales indicados en la web de la FER CUP.',
      },
    ],
  },
];
