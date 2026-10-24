const PRIVACY_DATE = { es: "22 de octubre de 2026", en: "October 22, 2026" };
import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { imagenSocial } from "@/lib/seo/imagen-social";

const ES_SECTIONS: LegalSection[] = [
  {
    "id": "responsable",
    "h": "1. Responsable y alcance",
    "body": [
      {
        "k": "p",
        "text": "**ContrataCR** es la marca comercial bajo la cual opera **Isaac Alberto Sanchez Monge**, persona física, cédula **208060421**, con domicilio de contacto en **Barrio Mercedes, Atenas, Alajuela, Costa Rica**. Contacto: **soporte@contratacr.com**. Mientras no se comunique un cambio efectivo de operador, esta persona es responsable de la Plataforma y del tratamiento de datos personales."
      },
      {
        "k": "p",
        "text": "Esta Política se aplica al sitio web, las aplicaciones móviles y las funciones asociadas de ContrataCR. El tratamiento se realiza conforme a la Ley N.º 8968 de Costa Rica y su reglamento."
      }
    ]
  },
  {
    "id": "datos",
    "h": "2. Datos que tratamos",
    "body": [
      {
        "k": "sub",
        "text": "2.1 Cuenta e identidad"
      },
      {
        "k": "ul",
        "items": [
          "Nombre, correo electrónico, teléfono y datos básicos compartidos por proveedores de inicio de sesión, como Google y Apple.",
          "Credenciales de acceso administradas de forma segura por nuestro proveedor de autenticación. ContrataCR no conserva su contraseña en texto legible.",
          "Número de identificación (cédula nacional, jurídica, DIMEX, NITE o pasaporte) cuando usted lo aporta. Al ingresar una identificación costarricense, solicita cotejar su número, tipo y nombre o razón social con la API pública de Hacienda. Guardamos esos datos y el resultado mínimo; no usamos ni publicamos deudas, actividades o situación tributaria. La consulta no confirma edad, biometría, quién usa la cuenta ni representación empresarial. Si no hay resultados puede solicitar revisión manual; un fallo temporal se reintenta sin considerarlo rechazo. Para revisión manual solicitamos foto con su identificación y, para empresas, personería o autorización vigente. Los documentos se revisan por una persona, sin reconocimiento facial automatizado; son privados y se conservan solo mientras sean necesarios para la revisión, seguridad o atención de reclamos. La identificación no aparece en el perfil público. Puede ejercer los derechos de acceso, rectificación y supresión conforme se describe en esta política."
        ]
      },
      {
        "k": "sub",
        "text": "2.2 Actividad como Cliente"
      },
      {
        "k": "ul",
        "items": [
          "Proyectos, cotizaciones, reseñas y favoritos.",
          "Los datos que aporta al pedir una cotización: nombre, teléfono, correo y, si lo indica, número de identificación.",
          "El teléfono de un proyecto no se muestra en el tablero público. Profesionales registrados que utilicen sus opciones de contacto pueden obtenerlo para coordinar, incluso antes de enviar un mensaje. No lo incluya en la descripción pública.",
          "Información incluida por usted en descripciones, notas, reportes y conversaciones.",
          "Zona, ubicación o punto geográfico cuando lo proporciona o autoriza."
        ]
      },
      {
        "k": "sub",
        "text": "2.3 Perfil profesional"
      },
      {
        "k": "ul",
        "items": [
          "Nombre o nombre comercial, servicios, descripción, teléfonos, correo de contacto y enlaces profesionales.",
          "Provincia, cantón, lugares de trabajo, zonas de cobertura y, si lo agrega, un punto en el mapa.",
          "Fotografía de perfil, casos de éxito, certificaciones, idiomas, aseguradoras y disponibilidad.",
          "Proyectos, reseñas, casos de éxito y demás actividad relacionada con su perfil."
        ]
      },
      {
        "k": "sub",
        "text": "2.4 Mensajes, soporte y archivos"
      },
      {
        "k": "ul",
        "items": [
          "Mensajes enviados dentro de ContrataCR y datos necesarios para identificar a los participantes y el contexto de la conversación.",
          "El estado de cada mensaje (enviado, recibido o visto), si fue editado o eliminado, y su preferencia de confirmaciones de lectura, que puede desactivar en Privacidad.",
          "Imágenes y documentos PDF que usted adjunte en mensajes o solicitudes de soporte.",
          "Consultas, tickets, reportes y comunicaciones con soporte."
        ]
      },
      {
        "k": "sub",
        "text": "2.5 Asistente de inteligencia artificial"
      },
      {
        "k": "p",
        "text": "Tratamos las consultas enviadas al asistente, sus respuestas y, si usted inició sesión, el historial que decida conservar. No incluya contraseñas, números completos de identificación, información financiera ni otros datos sensibles que no sean necesarios."
      },
      {
        "k": "sub",
        "text": "2.6 Dispositivo, uso y analítica"
      },
      {
        "k": "ul",
        "items": [
          "Dirección IP, tipo de dispositivo y navegador, sistema operativo, idioma, versión de la aplicación, identificadores técnicos y registros de seguridad.",
          "Interacciones con perfiles, servicios, botones de contacto, favoritos, proyectos y funciones de la Plataforma.",
          "Lo que escribe en el buscador junto con la zona y el orden elegidos, para entender qué se busca y qué no encuentra respuesta.",
          "Token de notificaciones push, plataforma, identificador del dispositivo y estado del permiso cuando activa notificaciones.",
          "Cookies y tecnologías similares necesarias para sesión, idioma, seguridad y funcionamiento; además de medición publicitaria cuando corresponda."
        ]
      },
      {
        "k": "p",
        "text": "**Datos obligatorios y opcionales:** los campos obligatorios se identifican en cada formulario; sin los datos mínimos de cuenta, contacto o identificación exigidos para una función no podremos completarla. Ubicación precisa, publicidad y asistente de IA son opcionales: rechazarlos no impide utilizar las demás funciones disponibles. No solicitamos imágenes de trabajos para verificar identidad ni reconocimiento facial automatizado."
      }
    ]
  },
  {
    "id": "finalidades",
    "h": "3. Para qué usamos los datos",
    "body": [
      {
        "k": "ul",
        "items": [
          "Crear, autenticar y administrar su cuenta.",
          "Publicar perfiles profesionales y conectar Clientes con Profesionales.",
          "Gestionar búsquedas, proyectos, cotizaciones, mensajes, archivos, reseñas y soporte.",
          "Personalizar resultados según servicio, zona y preferencias indicadas.",
          "Enviar correos y notificaciones relacionados con su cuenta o actividad.",
          "Enviar campañas y novedades promocionales cuando exista la autorización aplicable. Puede solicitar la baja mediante el enlace del correo o respondiendo; esto no cancela los mensajes necesarios para acceso, seguridad o atención de su cuenta.",
          "Operar el asistente de IA y conservar su historial cuando corresponda.",
          "Medir el uso, mejorar el producto y evaluar campañas de adquisición. El panel interno registra pantallas, búsquedas y sus filtros, navegación, intentos de envío y errores de formularios, y acciones relevantes de cuentas y visitantes sin sesión. Los recorridos detallados nuevos se conservan hasta 90 días; no grabamos pulsaciones, campos privados, contraseñas ni el contenido de conversaciones para analítica.",
          "Prevenir fraude, abuso, suplantación y fallos de seguridad.",
          "Cumplir obligaciones legales y atender requerimientos de autoridades competentes."
        ]
      },
      {
        "k": "note",
        "text": "**No vendemos sus datos personales.** Tampoco permitimos que terceros utilicen el contenido privado de sus conversaciones para enviarle publicidad."
      },
      {
        "k": "p",
        "text": "La aceptación de los Términos no equivale a autorizar todos los tratamientos. Pedimos permisos separados para usos opcionales cuando corresponde; puede retirar su autorización para usos futuros sin afectar la licitud de lo ya realizado ni impedir el tratamiento necesario o exigido por ley."
      }
    ]
  },
  {
    "id": "publicos",
    "h": "4. Información pública",
    "body": [
      {
        "k": "p",
        "text": "Los perfiles profesionales publicados pueden ser visibles sin iniciar sesión, compartirse mediante enlaces y aparecer en motores de búsqueda. Esto puede incluir nombre o nombre comercial, fotografía, servicios, zona general, descripción, casos de éxito, disponibilidad pública, reseñas e insignias."
      },
      {
        "k": "p",
        "text": "No mostramos públicamente contraseñas, tokens, el número completo de identificación, conversaciones privadas ni documentos privados. Usted debe evitar publicar en campos públicos información que no desea difundir."
      },
      {
        "k": "p",
        "text": "Los proyectos, promociones, empleos y reseñas publicados también pueden difundirse por enlaces y aparecer en buscadores. Terceros pueden conservar capturas, mensajes compartidos o copias en caché. Retirar contenido de ContrataCR no elimina automáticamente esas copias; puede solicitar apoyo para gestionar su retiro cuando proceda."
      }
    ]
  },
  {
    "id": "proveedores",
    "h": "5. Proveedores y transferencias",
    "body": [
      {
        "k": "p",
        "text": "Utilizamos proveedores tecnológicos para operar la Plataforma. Según la función utilizada, pueden intervenir:"
      },
      {
        "k": "ul",
        "items": [
          "**Supabase:** autenticación, base de datos y almacenamiento privado.",
          "**Cloudflare:** alojamiento y entrega de la aplicación web.",
          "**Cloudinary:** procesamiento y alojamiento de imágenes y determinados archivos.",
          "**Cloudflare R2:** almacenamiento de archivos y contenido multimedia.",
          "**Firebase:** entrega de notificaciones push.",
          "**Cloudflare Workers AI:** respaldo con temas predefinidos de ayuda; no recibe el texto original ni el historial de la conversación.",
          "El asistente no utiliza OpenAI como proveedor de respaldo.",
          "**Google y Apple:** inicio de sesión con su cuenta, mapas, ubicación y servicios relacionados.",
          "**Meta:** medición limitada de campañas mediante Conversions API y envío de avisos por WhatsApp. Para enviarle un aviso por WhatsApp, Meta recibe su número de teléfono y el texto del aviso, que nunca incluye el contenido de sus conversaciones.",
          "**Brevo:** envío de los correos de la Plataforma y medición de si un correo se entregó, se abrió o si usted tocó un enlace.",
          "Otros servicios necesarios para comunicaciones, seguridad y soporte.",
          "**Zoho Mail:** recepción y gestión del correo de soporte del dominio; recibe el contenido y los datos de contacto incluidos en sus comunicaciones."
        ]
      },
      {
        "k": "p",
        "text": "Algunos proveedores pueden procesar datos fuera de Costa Rica. Procuramos trabajar con proveedores que ofrecen medidas contractuales, técnicas y organizativas apropiadas. También podemos comunicar información a autoridades cuando exista una obligación legal."
      },
      {
        "k": "p",
        "text": "Los proveedores que procesan información por cuenta de ContrataCR deben utilizarla para los servicios encargados, bajo las garantías y condiciones aplicables. Algunos operan fuera de Costa Rica; evaluamos finalidad, acceso y medidas contractuales y de seguridad. La entrega a un proveedor tecnológico no equivale necesariamente a una transferencia a otro responsable. Si una comunicación a un responsable independiente requiere consentimiento u otra habilitación legal, se debe obtener antes de realizarla."
      }
    ]
  },
  {
    "id": "cookies",
    "h": "6. Cookies, analítica y publicidad",
    "body": [
      {
        "k": "p",
        "text": "Usamos cookies y almacenamiento necesarios para sesión, idioma, seguridad y preferencias. También registramos actividad interna para operar, diagnosticar y mejorar ContrataCR. Esto se distingue de la medición publicitaria de terceros."
      },
      {
        "k": "p",
        "text": "En web utilizamos medición limitada con Meta para evaluar visitas y conversiones de nuestras campañas. El servidor envía únicamente el tipo de evento, fecha, un identificador del evento, identificadores publicitarios del navegador o del clic y datos técnicos del navegador. No envía nombres, correo, teléfono, cédula, identificadores de cuenta, ubicación precisa, búsquedas escritas, conversaciones, documentos ni URLs con datos del usuario. Estos identificadores publicitarios no son datos anónimos. No cargamos Meta Pixel. Las versiones móviles compatibles usan eventos explícitos del SDK de Meta en Android, sin identificador publicitario de Android ni captura automática de campos o pantallas; el SDK procesa un identificador seudónimo de instalación y datos técnicos del dispositivo. En iOS usamos la atribución agregada de Apple, sin enviar eventos individuales a Meta ni solicitar el identificador publicitario. Las versiones anteriores pueden no disponer de estas funciones."
      },
      {
        "k": "p",
        "text": "La medición limitada está activada en web y en las versiones móviles compatibles salvo que exista un rechazo guardado. Puede solicitar la desactivación de la medición publicitaria mediante nuestros canales de contacto, sin bloquear el servicio. Conservamos los rechazos ya registrados. No mostramos una ventana automática ni interpretamos esta configuración como una aceptación expresa. Desactivarla detiene los envíos de este dispositivo inmediatamente y solicita cancelar las conversiones pendientes asociadas en nuestro servidor. Si no hay conexión, reintentamos la solicitud al reconectar o volver a abrir la aplicación. No puede retirarse con certeza un envío ya en curso ni se borran automáticamente datos que Meta haya recibido."
      },
      {
        "k": "p",
        "text": "La medición interna de cuentas y visitantes es seudónima cuando permite relacionar acciones: no equivale a estadísticas anónimas. Las búsquedas y zonas elegidas permanecen en la analítica interna y no se envían a Meta. Excluimos los administradores identificados y conservamos una marca de exclusión en su navegador al cerrar sesión; no podemos reconocerlos sin sesión en un navegador nuevo, privado o con almacenamiento borrado."
      },
      {
        "k": "p",
        "text": "Los correos pueden medir entrega, apertura y uso de enlaces mediante el proveedor de envío. La apertura puede ser aproximada por protecciones del cliente de correo. Puede solicitar la baja de campañas. Ubicación y notificaciones se administran también desde el sistema operativo; bloquear tecnologías necesarias puede afectar funciones concretas."
      }
    ]
  },
  {
    "id": "conservacion",
    "h": "7. Conservación y eliminación",
    "body": [
      {
        "k": "ul",
        "items": [
          "Los datos de cuenta y perfil se conservan mientras la cuenta permanezca activa.",
          "Solicitudes, mensajes, archivos, reseñas y reportes se conservan mientras sean necesarios para prestar el servicio, mantener la seguridad, resolver disputas o cumplir obligaciones.",
          "Los tokens push se desactivan cuando dejan de ser válidos y se eliminan cuando ya no son necesarios.",
          "Los registros técnicos y analíticos se conservan durante períodos razonables para seguridad, diagnóstico y medición, y pueden anonimizarse.",
          "Las copias de respaldo pueden tardar un período adicional razonable en desaparecer."
        ]
      },
      {
        "k": "p",
        "text": "Cuando solicite eliminar su cuenta o datos personales específicos, eliminaremos o anonimizaremos la información aplicable, salvo la información que debamos conservar temporalmente por seguridad, prevención de fraude, atención de reclamos u obligación legal. También solicitaremos la eliminación aplicable a nuestros proveedores."
      },
      {
        "k": "p",
        "text": "**Documentos de verificación:** son privados y su finalidad es la revisión y, cuando sea necesario, atender un reclamo o investigar fraude. La conservación no es indefinida ni se justifica solo porque la cuenta siga activa. Puede pedir su supresión; evaluaremos si existe una necesidad u obligación concreta de conservarlos y le explicaremos la decisión. No deben reutilizarse para publicidad ni enviarse al asistente de IA."
      },
      {
        "k": "p",
        "text": "Las solicitudes de eliminación alcanzan los sistemas y proveedores aplicables, con reintentos si un servicio está temporalmente indisponible. Podemos conservar un registro mínimo de una solicitud, consentimiento, baja de correos u obligación pendiente cuando sea necesario para demostrar su atención o evitar nuevos envíos. Toda excepción debe limitarse a su finalidad y plazo; no prometemos borrar de inmediato respaldos o copias controladas por terceros."
      }
    ]
  },
  {
    "id": "derechos",
    "h": "8. Sus derechos y solicitudes",
    "body": [
      {
        "k": "p",
        "text": "Conforme a la Ley N.º 8968, puede solicitar acceso, rectificación, actualización, supresión o eliminación de sus datos y oponerse a determinados tratamientos cuando proceda."
      },
      {
        "k": "p",
        "text": "Puede actualizar varios datos desde su cuenta. Para otras solicitudes escriba a **soporte@contratacr.com**, indicando el derecho y los datos afectados. Pediremos solo la información razonable para confirmar su identidad. Resolveremos las solicitudes de derechos dentro de **cinco días hábiles** desde su recepción, conforme a la Ley N.º 8968; si alguna medida técnica requiere seguimiento, informaremos su estado y fundamento sin sustituir ese plazo por uno genérico."
      },
      {
        "k": "p",
        "text": "La eliminación de cuenta o datos personales específicos puede solicitarse desde Cuenta y seguridad o mediante la página pública de eliminación de cuenta o datos."
      },
      {
        "k": "p",
        "text": "El trámite es gratuito. Puede retirar permisos opcionales y solicitar revisión de una decisión de verificación o moderación. Si considera vulnerados sus derechos, puede acudir a la **Agencia de Protección de Datos de los Habitantes (PRODHAB)** por sus canales oficiales; no exigimos renunciar a ese derecho ni resolver previamente una disputa privada."
      }
    ]
  },
  {
    "id": "seguridad",
    "h": "9. Seguridad e incidentes",
    "body": [
      {
        "k": "p",
        "text": "Aplicamos controles de acceso, cifrado en tránsito, restricciones sobre datos sensibles, validación de archivos y otras medidas razonables. Ningún sistema es completamente infalible. Si detectamos un incidente que requiera comunicación, actuaremos conforme a la legislación aplicable."
      },
      {
        "k": "p",
        "text": "Usted debe proteger sus credenciales, mantener actualizado su dispositivo y notificarnos si sospecha un acceso no autorizado."
      },
      {
        "k": "p",
        "text": "Ante una vulneración de seguridad que requiera aviso conforme a la normativa costarricense, comunicaremos a las personas afectadas la información exigida dentro del plazo de **cinco días hábiles** aplicable. Evaluaremos el alcance, contendremos el incidente y daremos seguimiento a las medidas necesarias. Esta obligación es distinta del objetivo de primera revisión de reportes de abuso."
      }
    ]
  },
  {
    "id": "decisiones",
    "h": "10. IA y decisiones automatizadas",
    "body": [
      {
        "k": "p",
        "text": "El asistente puede interpretar necesidades y sugerir servicios o enlaces, pero puede equivocarse. Sus respuestas son informativas y no sustituyen asesoría profesional, médica, legal, financiera o de seguridad."
      },
      {
        "k": "p",
        "text": "ContrataCR no utiliza el asistente para tomar decisiones con efectos legales sobre usted. Las acciones de moderación o verificación pueden apoyarse en señales automáticas, pero procuramos que exista revisión cuando una decisión relevante lo amerite."
      },
      {
        "k": "p",
        "text": "El asistente prioriza respuestas preparadas y el catálogo. Cuando hace falta respaldo, Cloudflare Workers AI recibe únicamente temas de ayuda predefinidos, sin el texto original, historial, datos de cuenta, documentos ni conversaciones privadas. No usamos OpenAI como respaldo de este asistente."
      }
    ]
  },
  {
    "id": "menores",
    "h": "11. Menores de edad",
    "body": [
      {
        "k": "p",
        "text": "ContrataCR está dirigido a personas de 18 años o más. No recolectamos intencionalmente datos de menores. Si considera que un menor creó una cuenta, contáctenos para revisarla."
      }
    ]
  },
  {
    "id": "cambios",
    "h": "12. Cambios y contacto",
    "body": [
      {
        "k": "p",
        "text": "Podemos actualizar esta Política para reflejar cambios legales o del producto. Publicaremos la nueva versión y su fecha. Cuando el cambio sea material, procuraremos comunicarlo por un medio razonable antes de que entre en vigor."
      },
      {
        "k": "p",
        "text": "Consultas y solicitudes: **soporte@contratacr.com**."
      },
      {
        "k": "p",
        "text": "Las nuevas finalidades que requieran consentimiento no se habilitan únicamente por publicar una política o por el uso continuado. Cuando cambie el responsable por constitución de una sociedad, informaremos su identidad, contacto y efectos del cambio; gestionaremos las autorizaciones y obligaciones que correspondan, sin eliminar derechos ni responsabilidades anteriores."
      }
    ]
  }
];

const EN_SECTIONS: LegalSection[] = [
  {
    "id": "controller",
    "h": "1. Controller and scope",
    "body": [
      {
        "k": "p",
        "text": "**ContrataCR** is the trade name operated by **Isaac Alberto Sanchez Monge**, an individual, Costa Rican identification number **208060421**, with contact address at **Barrio Mercedes, Atenas, Alajuela, Costa Rica**. Contact: **soporte@contratacr.com**. Until an effective change of operator is communicated, this individual is responsible for the Platform and personal data processing."
      },
      {
        "k": "p",
        "text": "This Policy applies to ContrataCR's website, mobile applications, and related features. Processing is governed by Costa Rican Law No. 8968 and its regulations."
      }
    ]
  },
  {
    "id": "data",
    "h": "2. Data we process",
    "body": [
      {
        "k": "sub",
        "text": "2.1 Account and identity"
      },
      {
        "k": "ul",
        "items": [
          "Name, email, phone number, and basic data shared by sign-in providers such as Google and Apple.",
          "Credentials securely managed by our authentication provider. ContrataCR does not keep your password in readable text.",
          "Identification number (national, corporate, DIMEX, NITE or passport) when you provide it. Entering a Costa Rican ID requests a check of its number, type and name or company name through Hacienda’s public API. We keep those details and the minimal outcome; we do not use or publish tax debts, activities or tax status. The lookup does not establish age, biometrics, who uses the account or company representation. If no result is found, you can request manual review; temporary outages are retried without treating them as rejection. Manual review requires a photo with your ID and, for companies, current representation or authorization documents. A person reviews these privately, without automated facial recognition. They are retained only as needed for review, security or complaints. IDs are not displayed on public profiles. You may exercise access, correction and deletion rights as described in this policy."
        ]
      },
      {
        "k": "sub",
        "text": "2.2 Client and Professional activity"
      },
      {
        "k": "ul",
        "items": [
          "Requests, posts, quotes, reviews, favorites, and related activity.",
          "A project phone number is not shown on the public board. Registered professionals using its contact options can obtain it to coordinate, even before sending a message. Do not put it in the public description.",
          "Professional profile data, services, location, work areas, success stories, availability, and contact details.",
          "Content you include in descriptions, notes, reports, and conversations."
        ]
      },
      {
        "k": "sub",
        "text": "2.3 Messages, files, support, and AI"
      },
      {
        "k": "ul",
        "items": [
          "Private messages and the data needed to identify participants and conversation context.",
          "Each message's status (sent, delivered, or seen), whether it was edited or deleted, and your read-receipt preference, which you can turn off in Privacy.",
          "Images and PDF documents attached to messages or support requests.",
          "AI assistant prompts, responses, and saved history when you are signed in. Do not submit unnecessary sensitive information."
        ]
      },
      {
        "k": "sub",
        "text": "2.4 Device, location, and usage"
      },
      {
        "k": "ul",
        "items": [
          "IP address, device and browser type, operating system, language, app version, technical identifiers, and security logs.",
          "Location when you provide it or grant permission.",
          "Push token, platform, device identifier, and permission status when notifications are enabled.",
          "Interactions, cookies, local storage, analytics, and campaign measurement data."
        ]
      },
      {
        "k": "p",
        "text": "**Required and optional data:** required fields are marked in each form; a feature cannot be completed without its minimum account, contact or identification data. Precise location, advertising and the AI assistant are optional: declining them does not prevent use of other available features. Identity checks do not require work images or automated facial recognition."
      }
    ]
  },
  {
    "id": "purposes",
    "h": "3. Why we use data",
    "body": [
      {
        "k": "ul",
        "items": [
          "Create and secure accounts.",
          "Send necessary account and activity communications. Promotional campaigns require the applicable authorization and can be stopped through the included link or by replying; necessary access, security and account support messages remain separate.",
          "Publish professional profiles and connect Clients with Professionals.",
          "Operate search, requests, quotes, messages, files, reviews, support, AI, and notifications.",
          "Personalize results, measure product use, improve the service, and assess acquisition campaigns. Internal analytics includes screens, searches and filters, navigation, form attempts and errors, and relevant account and guest actions. New detailed journeys are retained for up to 90 days; analytics does not record keystrokes, private fields, passwords or conversation content.",
          "Prevent fraud, abuse, impersonation, and security incidents.",
          "Comply with legal obligations and lawful authority requests."
        ]
      },
      {
        "k": "note",
        "text": "**We do not sell personal data.** We do not allow third parties to use private conversation content to send advertising."
      },
      {
        "k": "p",
        "text": "Accepting the Terms is not blanket permission for all processing. Separate permissions are requested for optional uses where applicable; withdrawal affects future authorized uses without invalidating prior lawful processing or preventing necessary or legally required processing."
      }
    ]
  },
  {
    "id": "public",
    "h": "4. Public information",
    "body": [
      {
        "k": "p",
        "text": "Published Professional profiles may be visible without signing in, shared through links, and indexed by search engines. Public information may include name or business name, photo, services, general area, description, success stories, public availability, reviews, and badges."
      },
      {
        "k": "p",
        "text": "Passwords, tokens, full identification numbers, private conversations, and private documents are not displayed publicly."
      },
      {
        "k": "p",
        "text": "Published projects, promotions, jobs and reviews may also be shared through links and appear in search engines. Third parties may retain screenshots, shared messages or cached copies. Removal from ContrataCR does not automatically erase those copies; you may request help seeking removal where appropriate."
      }
    ]
  },
  {
    "id": "providers",
    "h": "5. Providers and transfers",
    "body": [
      {
        "k": "p",
        "text": "Depending on the feature, we use providers including **Supabase** (authentication, database, private storage), **Cloudflare** (hosting, and R2 for media and files), **Cloudinary** (image processing and hosting), **Firebase** (push notifications), **Cloudflare Workers AI** (predefined product-help topics only, without original messages, history or account data), **Zoho Mail** (receiving and managing domain support emails and their content and contact data), **Brevo** (sending our emails and measuring whether an email was delivered, opened, or a link was tapped), **Google** and **Apple** (sign-in, maps, location), and **Meta** (limited campaign measurement through Conversions API, and delivery of WhatsApp notices — Meta receives your phone number and the notice text, never your conversation content)."
      },
      {
        "k": "p",
        "text": "Some providers may process data outside Costa Rica. We seek providers with appropriate contractual, technical, and organizational safeguards. We may also disclose information when legally required."
      },
      {
        "k": "p",
        "text": "Providers processing data on ContrataCR’s behalf must use it for the commissioned services under applicable safeguards and terms. Some operate outside Costa Rica; purpose, access, contractual and security measures must be assessed. Delivery to a technology provider is not necessarily a transfer to an independent controller. Consent or another legal basis must be obtained before any independent-controller disclosure that requires it."
      }
    ]
  },
  {
    "id": "cookies",
    "h": "6. Cookies, analytics, and advertising",
    "body": [
      {
        "k": "p",
        "text": "Necessary cookies and storage support sessions, language, security and preferences. Internal activity is also recorded to operate, diagnose and improve ContrataCR. This is separate from third-party advertising measurement."
      },
      {
        "k": "p",
        "text": "On the web, limited Meta measurement assesses campaign visits and conversions. The server sends only event type, date, event ID, browser or click advertising identifiers and technical browser data. It does not send names, email, phone, government IDs, account identifiers, precise location, typed searches, conversations, documents or URLs containing user data. Advertising identifiers are not anonymous data. We do not load Meta Pixel. Compatible mobile versions use explicit Meta SDK events on Android, without the Android advertising ID or automatic field or screen capture; the SDK processes a pseudonymous installation identifier and technical device data. iOS uses Apple’s aggregated attribution without sending individual events to Meta or requesting the advertising identifier. Older versions may not support these features."
      },
      {
        "k": "p",
        "text": "Limited measurement is enabled on the web and compatible mobile versions unless a saved rejection exists. You may request deactivation through our contact channels without losing access. We honour previously saved rejections. We show no automatic prompt and do not treat this setting as express acceptance. Disabling stops delivery from this device immediately and requests cancellation of associated pending conversions on our server. If offline, we retry when reconnecting or reopening the application. An already in-flight delivery cannot reliably be recalled, and data already received by Meta is not automatically erased."
      },
      {
        "k": "p",
        "text": "Internal account and guest activity is pseudonymous when actions can be linked; it is not anonymous statistics. Searches and selected areas remain in internal analytics and are not sent to Meta. Identified administrators are excluded, and a browser exclusion marker survives sign-out; we cannot identify a signed-out administrator in a new or private browser or after storage is cleared."
      },
      {
        "k": "p",
        "text": "Email providers may measure delivery, opens and link use. Open counts can be approximate because of mail-client privacy protections. You may unsubscribe from campaigns. Location and notifications can also be managed in the operating system; blocking necessary technologies may affect specific features."
      }
    ]
  },
  {
    "id": "retention",
    "h": "7. Retention and deletion",
    "body": [
      {
        "k": "p",
        "text": "Account and profile data is retained while the account is active. Requests, messages, files, reviews, reports, and technical records are kept for the time reasonably needed to provide the service, maintain security, resolve disputes, or comply with legal duties. Backups may take additional reasonable time to expire."
      },
      {
        "k": "p",
        "text": "Following an account or specific personal data deletion request, we delete or anonymize the applicable information except data temporarily retained for security, fraud prevention, claims, or legal compliance. We also request applicable deletion from our providers."
      },
      {
        "k": "p",
        "text": "**Verification documents:** these are private and used for review and, when necessary, a complaint or fraud investigation. Retention is not indefinite or justified solely because an account remains active. You may request erasure; any specific need or duty to retain them will be assessed and explained. They must not be reused for advertising or sent to the AI assistant."
      },
      {
        "k": "p",
        "text": "Deletion requests cover applicable systems and providers, with retries for temporarily unavailable services. Minimal records of requests, consent, email opt-outs or outstanding duties may be retained where needed to demonstrate handling or prevent further mail. Exceptions must be limited by purpose and duration; immediate erasure of backups or third-party-controlled copies is not promised."
      }
    ]
  },
  {
    "id": "rights",
    "h": "8. Your rights and requests",
    "body": [
      {
        "k": "p",
        "text": "Under Costa Rican Law No. 8968, you may request access, correction, update, suppression or deletion, and object to certain processing where applicable."
      },
      {
        "k": "p",
        "text": "Update available data from your account or write to **soporte@contratacr.com**, identifying the right and affected data. We request only reasonable identity confirmation. Rights requests will be resolved within **five business days** of receipt under Law No. 8968; any technical follow-up will be explained without replacing that deadline with a generic one. Account or specific-data deletion can be requested in Account & security or through the public account or data deletion page."
      },
      {
        "k": "p",
        "text": "Requests are free. Optional permissions may be withdrawn and verification or moderation decisions may be challenged. If you believe your rights were infringed, you may contact Costa Rica’s **PRODHAB** through its official channels; we do not require a waiver or prior resolution of a private dispute."
      }
    ]
  },
  {
    "id": "security",
    "h": "9. Security and incidents",
    "body": [
      {
        "k": "p",
        "text": "We use access controls, encryption in transit, restrictions on sensitive data, file validation, and other reasonable safeguards. No system is infallible. We will act under applicable law if an incident requires notice."
      },
      {
        "k": "p",
        "text": "For a security breach requiring notice under Costa Rican rules, affected people will receive the required information within the applicable **five-business-day** deadline. We will assess scope, contain the incident and follow up on necessary measures. This duty is separate from the initial abuse-report review target."
      }
    ]
  },
  {
    "id": "ai",
    "h": "10. AI and automated decisions",
    "body": [
      {
        "k": "p",
        "text": "The assistant may suggest services or links but can be wrong. Its responses are informational and do not replace professional, medical, legal, financial, or safety advice. ContrataCR does not use the assistant to make decisions with legal effects about you."
      },
      {
        "k": "p",
        "text": "The assistant prioritizes prepared answers and the catalogue. When fallback is needed, Cloudflare Workers AI receives predefined product-help topics only, without original text, history, account data, documents or private conversations. This assistant does not use OpenAI as a fallback."
      }
    ]
  },
  {
    "id": "minors",
    "h": "11. Minors",
    "body": [
      {
        "k": "p",
        "text": "ContrataCR is intended for people aged 18 and over. We do not knowingly collect data from minors. Contact us if you believe a minor created an account."
      }
    ]
  },
  {
    "id": "changes",
    "h": "12. Changes and contact",
    "body": [
      {
        "k": "p",
        "text": "We may update this Policy to reflect legal or product changes. We will publish the new version and date and seek to provide reasonable advance notice of material changes."
      },
      {
        "k": "p",
        "text": "Questions and requests: **soporte@contratacr.com**."
      },
      {
        "k": "p",
        "text": "New purposes requiring consent are not authorized merely by publishing a policy or continued use. If incorporation changes the controller, we will disclose its identity, contact details and effects, and handle applicable permissions and duties without erasing prior rights or responsibilities."
      }
    ]
  }
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = locale === "en"
    ? { title: "Privacy Policy - ContrataCR", description: "How ContrataCR processes and protects personal data." }
    : { title: "Política de Privacidad - ContrataCR", description: "Cómo ContrataCR trata y protege sus datos personales." };
  return { ...base, ...imagenSocial(locale) };
}

export default async function PrivacidadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return (
    <LegalDocument
      title={en ? "Privacy Policy" : "Política de Privacidad"}
      updated={en ? PRIVACY_DATE.en : PRIVACY_DATE.es}
      intro={en
        ? "This Policy explains what data ContrataCR processes across the website and mobile applications, why it is used, who may process it, and how you can exercise your rights."
        : "Esta Política explica qué datos trata ContrataCR en el sitio web y las aplicaciones móviles, para qué se utilizan, quiénes pueden procesarlos y cómo puede ejercer sus derechos."}
      summary={en
        ? ["We use data to operate the marketplace, messaging, support, AI, and notifications.", "Professional profiles are public and may appear in search engines.", "We do not sell personal data.", "You may request access, correction, account deletion, or deletion of specific personal data."]
        : ["Usamos datos para operar el marketplace, mensajes, soporte, IA y notificaciones.", "Los perfiles profesionales son públicos y pueden aparecer en buscadores.", "No vendemos sus datos personales.", "Puede solicitar acceso, corrección, eliminación de su cuenta o eliminación de datos específicos."]}
      sections={en ? EN_SECTIONS : ES_SECTIONS}
      footer={en ? (
        <div>
          Review our <Link href="/terminos" className="font-semibold text-[#0089BB] hover:underline">Terms and Conditions</Link>.
        </div>
      ) : (
        <div>
          Revise nuestros <Link href="/terminos" className="font-semibold text-[#0089BB] hover:underline">Términos y Condiciones</Link>.
        </div>
      )}
    />
  );
}
