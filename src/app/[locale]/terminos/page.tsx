import { LEGAL_DATE } from "@/lib/privacy/legal-version";
import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { imagenSocial } from "@/lib/seo/imagen-social";

const ES_SECTIONS: LegalSection[] = [
  {
    "id": "aceptacion",
    "h": "1. Aceptación y alcance",
    "body": [
      {
        "k": "p",
        "text": "Estos Términos regulan contratacr.com, las aplicaciones móviles y las funciones asociadas de **ContrataCR**. Al crear una cuenta se le informa de estos Términos y de la Política de Privacidad. La aceptación de las reglas del servicio no autoriza por sí sola publicidad, nuevos usos de datos personales ni permisos opcionales del dispositivo."
      },
      {
        "k": "p",
        "text": "Debe tener al menos 18 años y capacidad legal para aceptar estos Términos. Si no está de acuerdo, no utilice la Plataforma."
      }
    ]
  },
  {
    "id": "operador",
    "h": "1.1 Operador y contacto",
    "body": [
      {
        "k": "p",
        "text": "**ContrataCR** es la marca comercial bajo la cual opera **Isaac Alberto Sanchez Monge**, persona física, cédula **208060421**, con domicilio de contacto en **Barrio Mercedes, Atenas, Alajuela, Costa Rica**. Contacto: **soporte@contratacr.com**. Mientras no se comunique un cambio efectivo de operador, esta persona es responsable de la Plataforma y del tratamiento de datos personales."
      }
    ]
  },
  {
    "id": "definiciones",
    "h": "2. Definiciones",
    "body": [
      {
        "k": "ul",
        "items": [
          "**Plataforma:** el sitio web, las aplicaciones móviles y las herramientas tecnológicas de ContrataCR.",
          "**Usuario:** toda persona que utiliza la Plataforma como Cliente, Profesional o ambos.",
          "**Cliente:** quien busca, solicita, contacta o contrata servicios.",
          "**Profesional:** quien publica un perfil u ofrece servicios.",
          "**Servicio profesional:** el trabajo realizado por un Profesional, no por ContrataCR."
        ]
      }
    ]
  },
  {
    "id": "intermediario",
    "h": "3. ContrataCR es un intermediario",
    "body": [
      {
        "k": "p",
        "text": "**ContrataCR facilita el contacto y la coordinación entre Usuarios.** No presta, ejecuta, supervisa ni garantiza los servicios ofrecidos por Profesionales."
      },
      {
        "k": "ul",
        "items": [
          "ContrataCR no es parte del contrato o acuerdo entre Cliente y Profesional.",
          "Los Profesionales no son empleados, agentes ni representantes de ContrataCR.",
          "Cada Usuario decide con quién contratar y debe evaluar identidad, experiencia, licencias, seguros, precio y condiciones.",
          "ContrataCR no garantiza disponibilidad, calidad, seguridad, legalidad, puntualidad, resultado o finalización de un servicio."
        ]
      },
      {
        "k": "p",
        "text": "Los perfiles permiten comparar reseñas, casos de éxito, formación, certificaciones, experiencia y zonas de trabajo. Esta información procede de quienes la publican y puede requerir comprobación adicional. La insignia \"Verificado\" tiene únicamente el alcance explicado en la sección 6; no constituye una recomendación ni certificación del servicio. ContrataCR no garantiza clientes, ingresos, contrataciones ni colocación laboral."
      }
    ]
  },
  {
    "id": "publicaciones",
    "h": "4. Proyectos, promociones y empleos",
    "body": [
      {
        "k": "ul",
        "items": [
          "**Proyectos:** al publicar autoriza que su solicitud, nombre visible y zona se muestren en el tablero público y puedan compartirse mediante enlaces. Avisamos a profesionales relacionados con el servicio. El teléfono no se muestra en el tablero: profesionales registrados que utilicen las opciones de contacto del proyecto pueden obtenerlo para coordinar, aunque todavía no hayan enviado un mensaje. No incluya dirección exacta, documentos de identificación ni datos privados en la descripción.",
          "**Promociones:** quien publica debe informar claramente el precio final, impuestos y cargos aplicables, condiciones, vigencia, restricciones y disponibilidad, y cumplir lo anunciado. La publicación no garantiza ventas ni convierte a ContrataCR en prestador del servicio.",
          "**Empleos:** quien publica responde por la legitimidad de la vacante, la información y las condiciones laborales. No se permiten ofertas fraudulentas, discriminatorias o contrarias a la legislación ni cobros a candidatos para postularse. ContrataCR no es el empleador ni interviene en la selección. El contacto se realiza con quien publicó, mediante las opciones disponibles."
        ]
      }
    ]
  },
  {
    "id": "pagos",
    "h": "5. Contratación y pagos",
    "body": [
      {
        "k": "p",
        "text": "El precio, alcance, fechas, garantías, facturación y forma de pago del trabajo se acuerdan directamente entre Cliente y Profesional. Actualmente ContrataCR no procesa ni custodia esos pagos. Una futura función de pago requerirá información y condiciones específicas antes de contratarla; estos Términos no autorizan cobros futuros."
      },
      {
        "k": "p",
        "text": "Las partes deben documentar el alcance, condiciones, anticipos y comprobantes del trabajo. Las disputas sobre el servicio corresponden inicialmente a sus participantes, sin excluir responsabilidades propias de ContrataCR ni derechos que la ley no permita limitar."
      },
      {
        "k": "p",
        "text": "**Cotizaciones:** la herramienta permite preparar y compartir presupuestos, incluido PDF. Quien emite responde por el detalle, precios, impuestos y vigencia. Su valor como oferta, acuerdo o prueba depende del contenido y de lo pactado entre las partes. El PDF no es, por sí solo, una factura electrónica tributaria, un comprobante de pago ni una garantía de ContrataCR."
      }
    ]
  },
  {
    "id": "profesionales",
    "h": "6. Obligaciones de los Profesionales",
    "body": [
      {
        "k": "ul",
        "items": [
          "Publicar información verdadera, vigente y suficiente sobre sus servicios.",
          "Mantener las licencias, permisos, colegiaturas, seguros o autorizaciones exigidos para su actividad.",
          "No atribuirse certificaciones, experiencia o capacidades que no posee.",
          "Cumplir la legislación laboral, tributaria, sanitaria, profesional y de protección al consumidor que corresponda.",
          "Tratar de forma confidencial y lícita los datos recibidos de Clientes."
        ]
      },
      {
        "k": "note",
        "text": "**Qué significa \"Verificado\".** La insignia indica una comprobación limitada de los datos de identificación de la cuenta. **Consulta automática:** cotejamos número, tipo y nombre o razón social con la API pública de Hacienda; una coincidencia confirma esos datos en la fuente, no quién controla la cuenta. **Revisión manual:** cuando corresponde, una persona revisa una foto con la identificación y, para representación empresarial, personería o autorización. No se requieren fotos de casos de éxito para esta revisión. La consulta de una cédula jurídica no acredita por sí sola representación de la empresa. Ninguno de estos controles certifica edad, antecedentes, licencias, experiencia, calidad, solvencia ni resultado del servicio; tampoco garantiza quién utilizará la cuenta posteriormente. Podemos revisar o retirar la insignia ante inconsistencias. Antes de contratar, compruebe la identidad, representación y habilitaciones que necesite."
      }
    ]
  },
  {
    "id": "usuarios",
    "h": "7. Reglas de conducta",
    "body": [
      {
        "k": "p",
        "text": "Cada Usuario es responsable de su cuenta, de la información que publica y de la actividad realizada con sus credenciales."
      },
      {
        "k": "ul",
        "items": [
          "No suplantar personas o utilizar datos ajenos sin autorización.",
          "No publicar contenido falso, engañoso, discriminatorio, amenazante, difamatorio, sexualmente explícito o ilegal.",
          "No acosar, defraudar, enviar spam ni utilizar la Plataforma para actividades peligrosas o ilícitas.",
          "No intentar vulnerar, automatizar abusivamente, copiar, interferir o acceder sin autorización a la Plataforma.",
          "No recolectar, divulgar o comercializar datos de otros Usuarios fuera de la finalidad legítima de coordinar un servicio.",
          "No enviar malware, archivos dañinos ni contenido que infrinja derechos de terceros."
        ]
      }
    ]
  },
  {
    "id": "mensajes",
    "h": "8. Mensajes, archivos y notificaciones",
    "body": [
      {
        "k": "p",
        "text": "Los mensajes sirven para coordinar servicios. Los participantes son responsables de lo que envían. Puede adjuntar únicamente imágenes o documentos legítimos, necesarios y seguros; no debe incluir información sensible innecesaria."
      },
      {
        "k": "p",
        "text": "ContrataCR puede aplicar controles automáticos, límites, bloqueo de archivos y revisión asociada a reportes o seguridad. No supervisamos de forma permanente todas las conversaciones."
      },
      {
        "k": "p",
        "text": "Un mensaje propio puede editarse o eliminarse para todos durante los 15 minutos siguientes a su envío; después solo puede ocultarse para usted. La conversación puede mostrar si un mensaje fue enviado, recibido o visto; los avisos de \"Visto\" son recíprocos y pueden desactivarse en Privacidad."
      },
      {
        "k": "p",
        "text": "Cuando el contacto ocurre fuera de la Plataforma —por WhatsApp, llamada u otro medio— esa comunicación queda fuera del control de ContrataCR."
      },
      {
        "k": "p",
        "text": "Si activa notificaciones, podemos enviar avisos sobre mensajes, proyectos y empleos de su servicio, reseñas, soporte, seguridad y actividad de su cuenta. Puede desactivarlas desde el sistema operativo, aunque ciertos correos esenciales de cuenta o seguridad seguirán enviándose."
      },
      {
        "k": "p",
        "text": "Los mensajes necesarios para acceso, seguridad, soporte o gestión de su cuenta se distinguen de campañas promocionales. Las comunicaciones publicitarias requieren la autorización que corresponda y ofrecen una vía de baja; puede usar el enlace incluido o responder al correo. Rechazar publicidad no impide utilizar el servicio ni recibir comunicaciones necesarias. Los permisos de notificaciones pueden gestionarse desde el dispositivo."
      }
    ]
  },
  {
    "id": "ia",
    "h": "9. Asistente de inteligencia artificial",
    "body": [
      {
        "k": "p",
        "text": "El asistente ayuda a interpretar necesidades y encontrar funciones o servicios, pero sus respuestas pueden ser incompletas o incorrectas. No constituye asesoría profesional, médica, legal, financiera ni de emergencia."
      },
      {
        "k": "p",
        "text": "Usted debe verificar la información antes de tomar decisiones y no debe enviar al asistente contraseñas, información financiera, números completos de identificación ni datos sensibles innecesarios."
      },
      {
        "k": "p",
        "text": "Antes de enviar consultas a proveedores externos de IA se solicita permiso específico. Cloudflare Workers AI procesa la consulta y OpenAI puede intervenir como respaldo. Se comparte el texto y el contexto de conversación necesario, con medidas para reducir datos identificativos; esa depuración no garantiza anonimato. Puede no utilizar el asistente y seguir buscando servicios normalmente."
      }
    ]
  },
  {
    "id": "contenido",
    "h": "10. Contenido, perfiles y propiedad intelectual",
    "body": [
      {
        "k": "p",
        "text": "El Usuario conserva la titularidad de su contenido y concede una licencia no exclusiva y gratuita, limitada al tiempo y finalidades necesarios para alojarlo, copiarlo técnicamente, adaptarlo a formatos, mostrarlo, compartir enlaces del perfil o publicación, moderarlo y respaldarlo para operar la Plataforma. Esta licencia no transfiere la propiedad del contenido."
      },
      {
        "k": "p",
        "text": "El Usuario declara que posee los derechos y permisos necesarios sobre el contenido publicado. La marca, logotipo, diseño, textos propios y software de ContrataCR pertenecen a ContrataCR o a sus licenciantes y no pueden utilizarse sin autorización."
      },
      {
        "k": "p",
        "text": "Para usar su nombre, imagen o trabajos en campañas publicitarias externas de ContrataCR solicitaremos autorización específica, salvo otro fundamento legal aplicable. No publique documentos de identidad, expedientes, direcciones privadas ni imágenes de clientes o menores sin los permisos necesarios. Debe contar con autorización para fotos de casos de éxito y casos de éxito que involucren a terceros."
      }
    ]
  },
  {
    "id": "resenas",
    "h": "11. Reseñas, reportes y moderación",
    "body": [
      {
        "k": "p",
        "text": "ContrataCR mantiene **tolerancia cero frente a contenido ofensivo y usuarios abusivos**."
      },
      {
        "k": "ul",
        "items": [
          "Las reseñas deben describir experiencias reales y expresarse de forma respetuosa.",
          "Los Usuarios pueden reportar perfiles, clientes, mensajes, reseñas o conductas y bloquear inmediatamente a la otra persona desde las superficies compatibles.",
          "El contenido reportado puede ocultarse inmediatamente mientras se revisa.",
          "Nuestro objetivo es una primera revisión de reportes de seguridad o abuso en 24 horas, priorizando riesgos urgentes. La investigación y resolución pueden requerir más tiempo; este objetivo no sustituye los plazos legales aplicables.",
          "ContrataCR puede investigar, limitar visibilidad, retirar contenido, advertir, suspender o cancelar cuentas cuando exista incumplimiento, riesgo, fraude, orden legal o necesidad de proteger a la comunidad.",
          "Cuando sea razonablemente posible, el Usuario podrá contactar soporte para solicitar revisión de una medida."
        ]
      }
    ]
  },
  {
    "id": "cuenta",
    "h": "12. Cuenta, suspensión y eliminación",
    "body": [
      {
        "k": "p",
        "text": "Debe mantener datos de contacto correctos y proteger sus credenciales. Notifique de inmediato cualquier acceso no autorizado."
      },
      {
        "k": "p",
        "text": "Puede **desactivar su cuenta** desde Cuenta y seguridad. Al desactivarla, el perfil deja de estar visible y se cierra la sesión."
      },
      {
        "k": "p",
        "text": "Si desea la **eliminación permanente** de la cuenta o de datos personales específicos, puede solicitarla desde Cuenta y seguridad o mediante la página pública de eliminación de cuenta o datos. Si no puede entrar al panel, use el caso de soporte prellenado disponible en esa página para que podamos confirmar su identidad y darle seguimiento."
      },
      {
        "k": "p",
        "text": "La eliminación se gestiona conforme a la Política de Privacidad y puede excluir datos que debamos conservar temporalmente por seguridad, reclamos u obligación legal."
      },
      {
        "k": "p",
        "text": "ContrataCR puede suspender o cancelar una cuenta por incumplimiento, fraude, riesgo para terceros, inactividad prolongada, requerimiento legal o uso que perjudique el servicio."
      }
    ]
  },
  {
    "id": "terceros",
    "h": "13. Servicios y enlaces de terceros",
    "body": [
      {
        "k": "p",
        "text": "La Plataforma depende de proveedores de autenticación, alojamiento, almacenamiento, mapas, correo, notificaciones, IA y otros servicios. Sus condiciones y políticas también pueden aplicar cuando usted utiliza esas funciones."
      },
      {
        "k": "p",
        "text": "ContrataCR no controla la disponibilidad o el contenido de sitios externos y no responde por interrupciones atribuibles a terceros fuera de nuestro control razonable."
      }
    ]
  },
  {
    "id": "disponibilidad",
    "h": "14. Disponibilidad y limitación de responsabilidad",
    "body": [
      {
        "k": "p",
        "text": "Procuramos mantener la Plataforma segura y disponible, pero puede presentar mantenimiento, errores, interrupciones o pérdida temporal de funciones. No garantizamos funcionamiento continuo o libre de errores."
      },
      {
        "k": "p",
        "text": "La función de intermediación no excluye las obligaciones propias de ContrataCR sobre la Plataforma, la información que proporciona, el tratamiento de datos, la atención de reportes y las demás responsabilidades que establezca la ley. La responsabilidad por un hecho concreto se determina según sus circunstancias y la legislación aplicable, no únicamente por la denominación de intermediario."
      },
      {
        "k": "note",
        "text": "**Nada en estos Términos limita derechos o responsabilidades que la legislación costarricense no permita excluir**, incluidos los derechos aplicables de protección al consumidor."
      }
    ]
  },
  {
    "id": "privacidad",
    "h": "15. Privacidad",
    "body": [
      {
        "k": "p",
        "text": "El tratamiento de datos se rige por nuestra **Política de Privacidad**. Al utilizar permisos del dispositivo, como ubicación, archivos o notificaciones, se le mostrará la solicitud correspondiente y podrá administrarla desde el sistema operativo."
      }
    ]
  },
  {
    "id": "cambios",
    "h": "16. Cambios en estos Términos",
    "body": [
      {
        "k": "p",
        "text": "Podemos actualizar estos Términos para reflejar cambios legales, de seguridad o del producto. Publicaremos la versión y fecha vigentes. Cuando el cambio sea material, procuraremos comunicarlo por un medio razonable antes de su entrada en vigor."
      },
      {
        "k": "p",
        "text": "Cuando un cambio requiera nueva aceptación o consentimiento, lo solicitaremos de forma expresa antes del nuevo uso correspondiente. Continuar usando la Plataforma no sustituye el consentimiento necesario para nuevas finalidades de datos o publicidad. Puede rechazar funciones opcionales o solicitar eliminar su cuenta sin renunciar a derechos adquiridos."
      }
    ]
  },
  {
    "id": "ley",
    "h": "17. Legislación, controversias y contacto",
    "body": [
      {
        "k": "p",
        "text": "Estos Términos se rigen por las leyes de la República de Costa Rica. Las controversias se someterán a las autoridades y tribunales costarricenses competentes, sin perjuicio de derechos irrenunciables del consumidor."
      },
      {
        "k": "p",
        "text": "Consultas, reportes o solicitudes de revisión: **soporte@contratacr.com**."
      }
    ]
  }
];

const EN_SECTIONS: LegalSection[] = [
  {
    "id": "acceptance",
    "h": "1. Acceptance and scope",
    "body": [
      {
        "k": "p",
        "text": "These Terms govern contratacr.com, ContrataCR mobile applications and related features. These Terms and the Privacy Policy are presented when an account is created. Acceptance of service rules does not by itself authorize advertising, new personal data uses or optional device permissions."
      },
      {
        "k": "p",
        "text": "You must be at least 18 and legally able to accept these Terms."
      }
    ]
  },
  {
    "id": "operator",
    "h": "1.1 Operator and contact",
    "body": [
      {
        "k": "p",
        "text": "**ContrataCR** is the trade name operated by **Isaac Alberto Sanchez Monge**, an individual, Costa Rican identification number **208060421**, with contact address at **Barrio Mercedes, Atenas, Alajuela, Costa Rica**. Contact: **soporte@contratacr.com**. Until an effective change of operator is communicated, this individual is responsible for the Platform and personal data processing."
      }
    ]
  },
  {
    "id": "definitions",
    "h": "2. Definitions",
    "body": [
      {
        "k": "ul",
        "items": [
          "**Platform:** ContrataCR's website, mobile applications, and technology tools.",
          "**User:** anyone using the Platform as a Client, Professional, or both.",
          "**Client:** a User seeking, requesting, contacting, or hiring services.",
          "**Professional:** a User publishing a profile or offering services.",
          "**Professional service:** work performed by a Professional, not ContrataCR."
        ]
      }
    ]
  },
  {
    "id": "intermediary",
    "h": "3. ContrataCR is an intermediary",
    "body": [
      {
        "k": "p",
        "text": "**ContrataCR facilitates contact and coordination between Users.** It does not provide, perform, supervise, or guarantee Professional services."
      },
      {
        "k": "ul",
        "items": [
          "ContrataCR is not a party to agreements between Users.",
          "Professionals are not employees, agents, or representatives of ContrataCR.",
          "Each User must assess identity, experience, licenses, insurance, price, and terms.",
          "ContrataCR does not guarantee availability, quality, safety, legality, timeliness, results, or completion."
        ]
      },
      {
        "k": "p",
        "text": "Profiles allow comparisons of reviews, success stories, training, certifications, experience and work areas. This information comes from its publishers and may require further checks. The \"Verified\" badge has only the scope described in section 6; it is not an endorsement or certification of the service. ContrataCR does not guarantee customers, income, hiring or job placement."
      }
    ]
  },
  {
    "id": "listings",
    "h": "4. Projects, promotions, and jobs",
    "body": [
      {
        "k": "ul",
        "items": [
          "**Projects:** by posting, you authorize your request, display name and area to appear on the public board and be shared through links. We notify professionals related to the service. Your phone is not shown on the board: registered professionals using project contact options can obtain it to coordinate, even before sending a message. Do not include an exact address, identity documents or private data in the description.",
          "**Promotions:** publishers must clearly disclose the final price, applicable taxes and charges, conditions, validity, restrictions and availability, and honor the offer. A post does not guarantee sales or make ContrataCR the service provider.",
          "**Jobs:** publishers are responsible for legitimate vacancies, accurate information and lawful employment conditions. Fraudulent, discriminatory or unlawful offers and application fees for candidates are prohibited. ContrataCR is not the employer and does not take part in selection. Interested people contact the publisher through the available options."
        ]
      }
    ]
  },
  {
    "id": "payments",
    "h": "5. Hiring and payments",
    "body": [
      {
        "k": "p",
        "text": "Clients and Professionals directly agree on price, scope, dates, warranties, invoicing and payment for the work. ContrataCR currently does not process or hold those payments. Any future paid feature will require specific information and terms before purchase; these Terms do not authorize future charges."
      },
      {
        "k": "p",
        "text": "The parties should document scope, conditions, deposits and payment records. Service disputes are initially matters for the participants, without excluding ContrataCR’s own responsibilities or rights that cannot legally be limited."
      },
      {
        "k": "p",
        "text": "**Quotes:** the tool prepares and shares estimates, including PDF. The issuer is responsible for details, prices, taxes and validity. Their effect as an offer, agreement or evidence depends on the content and the parties’ agreement. A PDF is not by itself a tax-compliant electronic invoice, proof of payment or a ContrataCR guarantee."
      }
    ]
  },
  {
    "id": "professionals",
    "h": "6. Professional obligations",
    "body": [
      {
        "k": "ul",
        "items": [
          "Publish truthful, current information.",
          "Maintain licenses, permits, professional registration, insurance, or authorization required for the activity.",
          "Do not claim qualifications or experience you do not have.",
          "Comply with applicable labor, tax, health, professional, and consumer law.",
          "Handle Client data lawfully and confidentially."
        ]
      },
      {
        "k": "note",
        "text": "**What \"Verified\" means.** The badge indicates a limited check of account identification details. **Automatic lookup:** we compare number, type and name or company name with Hacienda’s public API; a match confirms those details in the source, not who controls the account. **Manual review:** where appropriate, a person reviews a photo with the ID and, for company representation, representation or authorization documents. Work photos are not required for this review. A corporate ID lookup does not by itself establish company representation. Neither check certifies age, background, licenses, experience, quality, solvency or service results, or guarantees who will use the account later. We may review or remove the badge for inconsistencies. Before contracting, check the identity, representation and qualifications you need."
      }
    ]
  },
  {
    "id": "conduct",
    "h": "7. Conduct rules",
    "body": [
      {
        "k": "p",
        "text": "Each User is responsible for their account, published information, and activity."
      },
      {
        "k": "ul",
        "items": [
          "No impersonation, fraud, harassment, spam, illegal or dangerous activity.",
          "No false, misleading, discriminatory, threatening, defamatory, sexually explicit, or unlawful content.",
          "No unauthorized access, abusive automation, interference, malware, or harmful files.",
          "No collection, disclosure, or sale of User data outside legitimate service coordination."
        ]
      }
    ]
  },
  {
    "id": "messages",
    "h": "8. Messages, files, and notifications",
    "body": [
      {
        "k": "p",
        "text": "Messages are for service coordination. Users are responsible for what they send and may only attach legitimate, necessary, and safe images or documents. Do not include unnecessary sensitive information."
      },
      {
        "k": "p",
        "text": "Your own message can be edited or deleted for everyone within 15 minutes of sending; after that it can only be hidden for you. Conversations may show whether a message was sent, delivered, or seen; \"Seen\" receipts are reciprocal and can be turned off in Privacy. Contact outside the Platform —WhatsApp, calls, or other means— is outside ContrataCR's control."
      },
      {
        "k": "p",
        "text": "Messages needed for access, security, support or account administration are separate from promotional campaigns. Advertising communications require the applicable authorization and provide an opt-out through the included link or by replying. Rejecting advertising does not prevent use of the service or necessary communications. Notification permissions can be managed on the device."
      }
    ]
  },
  {
    "id": "ai",
    "h": "9. Artificial intelligence assistant",
    "body": [
      {
        "k": "p",
        "text": "The assistant can help interpret needs and find services, but may be incomplete or wrong. It is not professional, medical, legal, financial, emergency, or safety advice. Verify information before acting."
      },
      {
        "k": "p",
        "text": "Specific permission is requested before sending prompts to external AI providers. Cloudflare Workers AI processes prompts and OpenAI may be used as a fallback. Text and necessary conversation context are shared with measures to reduce identifying data; this filtering does not guarantee anonymity. You may decline the assistant and continue searching normally."
      }
    ]
  },
  {
    "id": "content",
    "h": "10. Content and intellectual property",
    "body": [
      {
        "k": "p",
        "text": "Users retain ownership and grant a non-exclusive, royalty-free license limited to the time and purposes needed to host, technically copy, format, display, share profile or post links, moderate and back up content to operate the Platform. This license does not transfer ownership."
      },
      {
        "k": "p",
        "text": "Users represent that they have the required rights. ContrataCR's brand, logo, design, original text, and software belong to ContrataCR or its licensors."
      },
      {
        "k": "p",
        "text": "Using your name, image or work in ContrataCR’s external advertising campaigns requires specific permission unless another legal basis applies. Do not publish IDs, records, private addresses or images of clients or children without required permissions. Work photos and success stories involving third parties require appropriate authorization."
      }
    ]
  },
  {
    "id": "moderation",
    "h": "11. Reviews, reports, and moderation",
    "body": [
      {
        "k": "p",
        "text": "ContrataCR has **zero tolerance for objectionable content and abusive users**."
      },
      {
        "k": "ul",
        "items": [
          "Reviews must describe genuine experiences respectfully.",
          "Users may report profiles, messages, reviews, or conduct and immediately block the other person from supported surfaces.",
          "Reported content may be hidden immediately while it is reviewed.",
          "Our target is an initial review of safety or abuse reports within 24 hours, prioritizing urgent risks. Investigation and resolution may take longer; this target does not replace applicable legal deadlines.",
          "ContrataCR may investigate, limit visibility, remove content, warn, suspend, or terminate accounts for breach, risk, fraud, legal orders, or community protection.",
          "Where reasonably possible, Users may contact support to request review of an action."
        ]
      }
    ]
  },
  {
    "id": "account",
    "h": "12. Account, suspension, and deletion",
    "body": [
      {
        "k": "p",
        "text": "Keep contact information accurate and credentials secure. You can **disable your account** from Account & security. When disabled, your profile is hidden and your session is signed out."
      },
      {
        "k": "p",
        "text": "If you want **permanent deletion** of the account or specific personal data, you can request it from Account & security or through the public account or data deletion page. If you cannot access your panel, use the prefilled support case available on that page so we can confirm your identity and follow up."
      },
      {
        "k": "p",
        "text": "Deletion is handled according to the Privacy Policy. Some data may be temporarily retained for security, claims, or legal duties."
      },
      {
        "k": "p",
        "text": "ContrataCR may suspend or terminate accounts for breach, fraud, risk to others, prolonged inactivity, legal requirements, or harmful use."
      }
    ]
  },
  {
    "id": "third-parties",
    "h": "13. Third-party services",
    "body": [
      {
        "k": "p",
        "text": "The Platform relies on authentication, hosting, storage, maps, email, notifications, AI, and other providers. Their terms and policies may also apply. ContrataCR does not control external websites or outages outside its reasonable control."
      }
    ]
  },
  {
    "id": "availability",
    "h": "14. Availability and liability",
    "body": [
      {
        "k": "p",
        "text": "We seek to keep the Platform secure and available, but maintenance, errors, interruptions, or temporary loss of features may occur. Continuous, error-free operation is not guaranteed."
      },
      {
        "k": "p",
        "text": "Acting as an intermediary does not exclude ContrataCR’s own obligations regarding the Platform, information it provides, data processing, report handling and other duties imposed by law. Responsibility for a particular event depends on its circumstances and applicable law, not solely on the intermediary label."
      },
      {
        "k": "note",
        "text": "**Nothing in these Terms limits rights or responsibilities that Costa Rican law does not allow us to exclude**, including applicable consumer rights."
      }
    ]
  },
  {
    "id": "privacy",
    "h": "15. Privacy",
    "body": [
      {
        "k": "p",
        "text": "Data processing is governed by the **Privacy Policy**. Device permissions such as location, files, and notifications can be managed through the operating system."
      }
    ]
  },
  {
    "id": "changes",
    "h": "16. Changes to these Terms",
    "body": [
      {
        "k": "p",
        "text": "We may update these Terms for legal, security, or product changes. We will publish the current version and date and seek to provide reasonable advance notice of material changes."
      },
      {
        "k": "p",
        "text": "Where a change requires renewed acceptance or consent, we will request it expressly before the relevant new use. Continued use does not replace required consent for new data purposes or advertising. You may decline optional features or request account deletion without waiving accrued rights."
      }
    ]
  },
  {
    "id": "law",
    "h": "17. Law, disputes, and contact",
    "body": [
      {
        "k": "p",
        "text": "These Terms are governed by Costa Rican law. Disputes are subject to the competent Costa Rican authorities and courts, without limiting non-waivable consumer rights."
      },
      {
        "k": "p",
        "text": "Questions, reports, or review requests: **soporte@contratacr.com**."
      }
    ]
  }
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = locale === "en"
    ? { title: "Terms and Conditions - ContrataCR", description: "Terms governing use of ContrataCR." }
    : { title: "Términos y Condiciones - ContrataCR", description: "Condiciones que regulan el uso de ContrataCR." };
  return { ...base, ...imagenSocial(locale) };
}

export default async function TerminosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return (
    <LegalDocument
      title={en ? "Terms and Conditions" : "Términos y Condiciones"}
      updated={en ? LEGAL_DATE.en : LEGAL_DATE.es}
      intro={en
        ? "These Terms explain the rules for using ContrataCR as a Client or Professional across the website and mobile applications."
        : "Estos Términos explican las reglas para utilizar ContrataCR como Cliente o Profesional en el sitio web y las aplicaciones móviles."}
      summary={en
        ? ["ContrataCR connects Clients and Professionals but does not perform Professional services.", "Hiring terms and payments are agreed directly between Users.", "Users must act lawfully, truthfully, and respectfully.", "Accounts and content may be restricted for fraud, abuse, or legal violations."]
        : ["ContrataCR conecta Clientes y Profesionales, pero no realiza los servicios profesionales.", "La contratación y los pagos se acuerdan directamente entre Usuarios.", "Los Usuarios deben actuar de forma legal, veraz y respetuosa.", "Las cuentas y el contenido pueden limitarse ante fraude, abuso o incumplimientos."]}
      sections={en ? EN_SECTIONS : ES_SECTIONS}
      footer={en ? (
        <>Review our <Link href="/privacidad" className="font-semibold text-[#0089BB] hover:underline">Privacy Policy</Link>.</>
      ) : (
        <>Revise nuestra <Link href="/privacidad" className="font-semibold text-[#0089BB] hover:underline">Política de Privacidad</Link>.</>
      )}
    />
  );
}
