import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { imagenSocial } from "@/lib/seo/imagen-social";

const ES_SECTIONS: LegalSection[] = [
  {
    id: "aceptacion",
    h: "1. Aceptación y alcance",
    body: [
      { k: "p", text: "Estos Términos regulan el uso de contratacr.com, las aplicaciones móviles y las funciones asociadas de **ContrataCR**. Al crear una cuenta o utilizar la Plataforma, usted acepta estos Términos y la Política de Privacidad." },
      { k: "p", text: "Debe tener al menos 18 años y capacidad legal para aceptar estos Términos. Si no está de acuerdo, no utilice la Plataforma." },
    ],
  },
  {
    id: "definiciones",
    h: "2. Definiciones",
    body: [{ k: "ul", items: [
      "**Plataforma:** el sitio web, las aplicaciones móviles y las herramientas tecnológicas de ContrataCR.",
      "**Usuario:** toda persona que utiliza la Plataforma como Cliente, Profesional o ambos.",
      "**Cliente:** quien busca, solicita, contacta o contrata servicios.",
      "**Profesional:** quien publica un perfil u ofrece servicios.",
      "**Servicio profesional:** el trabajo realizado por un Profesional, no por ContrataCR.",
    ] }],
  },
  {
    id: "intermediario",
    h: "3. ContrataCR es un intermediario",
    body: [
      { k: "p", text: "**ContrataCR facilita el contacto y la coordinación entre Usuarios.** No presta, ejecuta, supervisa ni garantiza los servicios ofrecidos por Profesionales." },
      { k: "ul", items: [
        "ContrataCR no es parte del contrato o acuerdo entre Cliente y Profesional.",
        "Los Profesionales no son empleados, agentes ni representantes de ContrataCR.",
        "Cada Usuario decide con quién contratar y debe evaluar identidad, experiencia, licencias, seguros, precio y condiciones.",
        "ContrataCR no garantiza disponibilidad, calidad, seguridad, legalidad, puntualidad, resultado o finalización de un servicio.",
      ] },
      { k: "p", text: "Para que cada Usuario elija con información, la Plataforma muestra en los perfiles **datos para comparar**: reseñas de Clientes, casos de éxito, formación y certificaciones, idiomas, años de experiencia, zonas de trabajo, precio de referencia y, cuando corresponde, la insignia de cédula verificada. Esa información la publica cada Profesional —las reseñas, los Clientes— y es responsabilidad de quien la publica. Revisarla, comparar y decidir con quién contratar corresponde a cada Usuario." },
    ],
  },
  {
    id: "publicaciones",
    h: "4. Proyectos, promociones y empleos",
    body: [
      { k: "ul", items: [
        "**Proyectos:** al publicar un proyecto, este se muestra a los Profesionales del servicio elegido para que puedan escribirle. El teléfono que indique no se publica: se comparte solo con el Profesional que le responda.",
        "**Promociones:** el precio, las condiciones, la vigencia y la disponibilidad de una promoción los define y cumple el Profesional que la publica.",
        "**Empleos:** ContrataCR no es el empleador ni interviene en la selección. Quien se interese por un empleo se comunica directamente con quien lo publicó, por WhatsApp o por Mensajes. Desconfíe de cualquier oferta que pida pagos para postularse y repórtela.",
      ] },
    ],
  },
  {
    id: "pagos",
    h: "5. Contratación y pagos",
    body: [
      { k: "p", text: "El precio, alcance, fecha, garantías, facturación y forma de pago del servicio profesional se acuerdan directamente entre Cliente y Profesional. ContrataCR no procesa ni custodia esos pagos, salvo que una función futura lo indique expresamente mediante condiciones adicionales." },
      { k: "p", text: "ContrataCR no responde por anticipos, falta de pago, cobros indebidos, reembolsos, daños o disputas económicas entre Usuarios. Recomendamos documentar por escrito el alcance y las condiciones antes de iniciar un trabajo." },
    ],
  },
  {
    id: "profesionales",
    h: "6. Obligaciones de los Profesionales",
    body: [
      { k: "ul", items: [
        "Publicar información verdadera, vigente y suficiente sobre sus servicios.",
        "Mantener las licencias, permisos, colegiaturas, seguros o autorizaciones exigidos para su actividad.",
        "No atribuirse certificaciones, experiencia o capacidades que no posee.",
        "Cumplir la legislación laboral, tributaria, sanitaria, profesional y de protección al consumidor que corresponda.",
        "Tratar de forma confidencial y lícita los datos recibidos de Clientes.",
      ] },
      { k: "note", text: "**Qué significa «Cédula verificada».** El check azul indica que ContrataCR comprobó el documento de identidad de quien publica —un Profesional o, si decidió aportar su cédula al publicar un proyecto, un Cliente— de una de dos formas. **Automática:** el número de cédula existe en el padrón electoral del Tribunal Supremo de Elecciones y el nombre que se muestra se tomó de ese padrón. **Manual:** cuando el padrón no cubre el caso (por ejemplo, cédula jurídica, DIMEX, pasaporte o una cédula reciente) o el resultado no coincide, una persona del equipo revisa una foto de la persona sosteniendo su documento y, en el caso de un Profesional, una foto de un trabajo suyo. Es una comprobación limitada a ese momento: **no** garantiza que quien usa la cuenta en cada ocasión sea el titular del documento y **no** certifica antecedentes, experiencia, licencias, permisos, calidad ni resultado del servicio. ContrataCR puede retirar la insignia si detecta información falsa o inconsistente. Cualquiera de las partes puede pedirle a la otra que se identifique antes de contratar o de aceptar un trabajo." },
    ],
  },
  {
    id: "usuarios",
    h: "7. Reglas de conducta",
    body: [
      { k: "p", text: "Cada Usuario es responsable de su cuenta, de la información que publica y de la actividad realizada con sus credenciales." },
      { k: "ul", items: [
        "No suplantar personas o utilizar datos ajenos sin autorización.",
        "No publicar contenido falso, engañoso, discriminatorio, amenazante, difamatorio, sexualmente explícito o ilegal.",
        "No acosar, defraudar, enviar spam ni utilizar la Plataforma para actividades peligrosas o ilícitas.",
        "No intentar vulnerar, automatizar abusivamente, copiar, interferir o acceder sin autorización a la Plataforma.",
        "No recolectar, divulgar o comercializar datos de otros Usuarios fuera de la finalidad legítima de coordinar un servicio.",
        "No enviar malware, archivos dañinos ni contenido que infrinja derechos de terceros.",
      ] },
    ],
  },
  {
    id: "mensajes",
    h: "8. Mensajes, archivos y notificaciones",
    body: [
      { k: "p", text: "Los mensajes sirven para coordinar servicios. Los participantes son responsables de lo que envían. Puede adjuntar únicamente imágenes o documentos legítimos, necesarios y seguros; no debe incluir información sensible innecesaria." },
      { k: "p", text: "ContrataCR puede aplicar controles automáticos, límites, bloqueo de archivos y revisión asociada a reportes o seguridad. No supervisamos de forma permanente todas las conversaciones." },
      { k: "p", text: "Un mensaje propio puede editarse o eliminarse para todos durante los 15 minutos siguientes a su envío; después solo puede ocultarse para usted. La conversación puede mostrar si un mensaje fue enviado, recibido o visto; los avisos de «Visto» son recíprocos y pueden desactivarse en Privacidad." },
      { k: "p", text: "Cuando el contacto ocurre fuera de la Plataforma —por WhatsApp, llamada u otro medio— esa comunicación queda fuera del control de ContrataCR." },
      { k: "p", text: "Si activa notificaciones, podemos enviar avisos sobre mensajes, proyectos, cotizaciones, reseñas, seguridad y actividad de su cuenta. Puede desactivarlas desde el sistema operativo, aunque ciertos correos esenciales de cuenta o seguridad seguirán enviándose." },
      { k: "p", text: "También podemos enviarle por correo novedades ocasionales sobre ContrataCR. Puede pedir la baja respondiendo a cualquiera de esos correos." },
    ],
  },
  {
    id: "ia",
    h: "9. Asistente de inteligencia artificial",
    body: [
      { k: "p", text: "El asistente ayuda a interpretar necesidades y encontrar funciones o servicios, pero sus respuestas pueden ser incompletas o incorrectas. No constituye asesoría profesional, médica, legal, financiera ni de emergencia." },
      { k: "p", text: "Usted debe verificar la información antes de tomar decisiones y no debe enviar al asistente contraseñas, información financiera, números completos de identificación ni datos sensibles innecesarios." },
    ],
  },
  {
    id: "contenido",
    h: "10. Contenido, perfiles y propiedad intelectual",
    body: [
      { k: "p", text: "El Usuario conserva la titularidad de su contenido. Al publicarlo, otorga a ContrataCR una licencia no exclusiva, mundial y gratuita, durante el tiempo necesario para alojarlo, copiarlo técnicamente, adaptarlo a formatos o tamaños, mostrarlo, distribuirlo dentro de la Plataforma, moderarlo y crear copias de respaldo para operar y promocionar su perfil o solicitud." },
      { k: "p", text: "El Usuario declara que posee los derechos y permisos necesarios sobre el contenido publicado. La marca, logotipo, diseño, textos propios y software de ContrataCR pertenecen a ContrataCR o a sus licenciantes y no pueden utilizarse sin autorización." },
    ],
  },
  {
    id: "resenas",
    h: "11. Reseñas, reportes y moderación",
    body: [
      { k: "p", text: "ContrataCR mantiene **tolerancia cero frente a contenido ofensivo y usuarios abusivos**." },
      { k: "ul", items: [
        "Las reseñas deben describir experiencias reales y expresarse de forma respetuosa.",
        "Los Usuarios pueden reportar perfiles, clientes, mensajes, reseñas o conductas y bloquear inmediatamente a la otra persona desde las superficies compatibles.",
        "El contenido reportado puede ocultarse inmediatamente mientras se revisa.",
        "ContrataCR procura revisar y actuar sobre reportes de seguridad o abuso en un plazo máximo de 24 horas.",
        "ContrataCR puede investigar, limitar visibilidad, retirar contenido, advertir, suspender o cancelar cuentas cuando exista incumplimiento, riesgo, fraude, orden legal o necesidad de proteger a la comunidad.",
        "Cuando sea razonablemente posible, el Usuario podrá contactar soporte para solicitar revisión de una medida.",
      ] },
    ],
  },
  {
    id: "cuenta",
    h: "12. Cuenta, suspensión y eliminación",
    body: [
      { k: "p", text: "Debe mantener datos de contacto correctos y proteger sus credenciales. Notifique de inmediato cualquier acceso no autorizado." },
      { k: "p", text: "Puede **desactivar su cuenta** desde Cuenta y seguridad. Al desactivarla, el perfil deja de estar visible y se cierra la sesión." },
      { k: "p", text: "Si desea la **eliminación permanente** de la cuenta o de datos personales específicos, puede solicitarla desde Cuenta y seguridad o mediante la página pública de eliminación de cuenta o datos. Si no puede entrar al panel, use el caso de soporte prellenado disponible en esa página para que podamos confirmar su identidad y darle seguimiento." },
      { k: "p", text: "La eliminación se gestiona conforme a la Política de Privacidad y puede excluir datos que debamos conservar temporalmente por seguridad, reclamos u obligación legal." },
      { k: "p", text: "ContrataCR puede suspender o cancelar una cuenta por incumplimiento, fraude, riesgo para terceros, inactividad prolongada, requerimiento legal o uso que perjudique el servicio." },
    ],
  },
  {
    id: "terceros",
    h: "13. Servicios y enlaces de terceros",
    body: [
      { k: "p", text: "La Plataforma depende de proveedores de autenticación, alojamiento, almacenamiento, mapas, correo, notificaciones, IA y otros servicios. Sus condiciones y políticas también pueden aplicar cuando usted utiliza esas funciones." },
      { k: "p", text: "ContrataCR no controla la disponibilidad o el contenido de sitios externos y no responde por interrupciones atribuibles a terceros fuera de nuestro control razonable." },
    ],
  },
  {
    id: "disponibilidad",
    h: "14. Disponibilidad y limitación de responsabilidad",
    body: [
      { k: "p", text: "Procuramos mantener la Plataforma segura y disponible, pero puede presentar mantenimiento, errores, interrupciones o pérdida temporal de funciones. No garantizamos funcionamiento continuo o libre de errores." },
      { k: "p", text: "En la máxima medida permitida por la ley, ContrataCR no responde por daños derivados del servicio prestado por un Profesional, acuerdos entre Usuarios, contenido publicado por terceros o eventos fuera de nuestro control razonable." },
      { k: "note", text: "**Nada en estos Términos limita derechos o responsabilidades que la legislación costarricense no permita excluir**, incluidos los derechos aplicables de protección al consumidor." },
    ],
  },
  {
    id: "privacidad",
    h: "15. Privacidad",
    body: [
      { k: "p", text: "El tratamiento de datos se rige por nuestra **Política de Privacidad**. Al utilizar permisos del dispositivo, como ubicación, archivos o notificaciones, se le mostrará la solicitud correspondiente y podrá administrarla desde el sistema operativo." },
    ],
  },
  {
    id: "cambios",
    h: "16. Cambios en estos Términos",
    body: [
      { k: "p", text: "Podemos actualizar estos Términos para reflejar cambios legales, de seguridad o del producto. Publicaremos la versión y fecha vigentes. Cuando el cambio sea material, procuraremos comunicarlo por un medio razonable antes de su entrada en vigor." },
      { k: "p", text: "El uso continuado después de la entrada en vigor implica aceptación de la versión actualizada. Si no está de acuerdo, puede dejar de usar la Plataforma y solicitar eliminar su cuenta." },
    ],
  },
  {
    id: "ley",
    h: "17. Legislación, controversias y contacto",
    body: [
      { k: "p", text: "Estos Términos se rigen por las leyes de la República de Costa Rica. Las controversias se someterán a las autoridades y tribunales costarricenses competentes, sin perjuicio de derechos irrenunciables del consumidor." },
      { k: "p", text: "Consultas, reportes o solicitudes de revisión: **soporte@contratacr.com**." },
    ],
  },
];

const EN_SECTIONS: LegalSection[] = [
  { id: "acceptance", h: "1. Acceptance and scope", body: [
    { k: "p", text: "These Terms govern contratacr.com, ContrataCR mobile applications, and related features. By creating an account or using the Platform, you accept these Terms and the Privacy Policy." },
    { k: "p", text: "You must be at least 18 and legally able to accept these Terms." },
  ] },
  { id: "definitions", h: "2. Definitions", body: [{ k: "ul", items: ["**Platform:** ContrataCR's website, mobile applications, and technology tools.", "**User:** anyone using the Platform as a Client, Professional, or both.", "**Client:** a User seeking, requesting, contacting, or hiring services.", "**Professional:** a User publishing a profile or offering services.", "**Professional service:** work performed by a Professional, not ContrataCR."] }] },
  { id: "intermediary", h: "3. ContrataCR is an intermediary", body: [
    { k: "p", text: "**ContrataCR facilitates contact and coordination between Users.** It does not provide, perform, supervise, or guarantee Professional services." },
    { k: "ul", items: ["ContrataCR is not a party to agreements between Users.", "Professionals are not employees, agents, or representatives of ContrataCR.", "Each User must assess identity, experience, licenses, insurance, price, and terms.", "ContrataCR does not guarantee availability, quality, safety, legality, timeliness, results, or completion."] },
    { k: "p", text: "So that each User can choose with information, profiles show **data to compare**: Client reviews, success stories, training and certifications, languages, years of experience, work areas, a reference price and, where applicable, the ID-verified badge. Each Professional publishes that information —reviews come from Clients— and is responsible for it. Reviewing it, comparing and deciding whom to hire is up to each User." },
  ] },
  { id: "listings", h: "4. Projects, promotions, and jobs", body: [
    { k: "ul", items: ["**Projects:** a published project is shown to Professionals in the chosen service so they can write to you. The phone number you provide is not published: it is shared only with the Professional who replies.", "**Promotions:** the price, conditions, validity, and availability of a promotion are set and honored by the Professional who publishes it.", "**Jobs:** ContrataCR is not the employer and does not take part in hiring. Anyone interested contacts the poster directly via WhatsApp or Messages. Be wary of any job asking for payment to apply, and report it."] },
  ] },
  { id: "payments", h: "5. Hiring and payments", body: [
    { k: "p", text: "Clients and Professionals directly agree on price, scope, timing, warranties, invoicing, and payment. ContrataCR does not process or hold those payments unless a future feature expressly states otherwise under additional terms." },
    { k: "p", text: "ContrataCR is not liable for deposits, non-payment, improper charges, refunds, damages, or financial disputes between Users." },
  ] },
  { id: "professionals", h: "6. Professional obligations", body: [
    { k: "ul", items: ["Publish truthful, current information.", "Maintain licenses, permits, professional registration, insurance, or authorization required for the activity.", "Do not claim qualifications or experience you do not have.", "Comply with applicable labor, tax, health, professional, and consumer law.", "Handle Client data lawfully and confidentially."] },
    { k: "note", text: "**What «ID verified» means.** The blue check indicates that ContrataCR checked the identity document of whoever publishes —a Professional or, if they chose to provide their ID when posting a project, a Client— in one of two ways. **Automatic:** the ID (cédula) number exists in the electoral roll of Costa Rica's Supreme Electoral Tribunal (TSE) and the name shown was taken from that roll. **Manual:** when the roll does not cover the case (for example, a corporate ID, DIMEX, passport, or a recently issued ID) or the result does not match, a team member reviews a photo of the person holding their document and, for a Professional, a photo of their work. It is a limited check at that point in time: it does **not** guarantee that the person using the account at any given moment is the document holder, and does **not** certify background, experience, licenses, permits, quality, or results. ContrataCR may remove the badge if it detects false or inconsistent information. Either party may ask the other to identify themselves before hiring or accepting a job." },
  ] },
  { id: "conduct", h: "7. Conduct rules", body: [
    { k: "p", text: "Each User is responsible for their account, published information, and activity." },
    { k: "ul", items: ["No impersonation, fraud, harassment, spam, illegal or dangerous activity.", "No false, misleading, discriminatory, threatening, defamatory, sexually explicit, or unlawful content.", "No unauthorized access, abusive automation, interference, malware, or harmful files.", "No collection, disclosure, or sale of User data outside legitimate service coordination."] },
  ] },
  { id: "messages", h: "8. Messages, files, and notifications", body: [
    { k: "p", text: "Messages are for service coordination. Users are responsible for what they send and may only attach legitimate, necessary, and safe images or documents. Do not include unnecessary sensitive information." },
    { k: "p", text: "Your own message can be edited or deleted for everyone within 15 minutes of sending; after that it can only be hidden for you. Conversations may show whether a message was sent, delivered, or seen; «Seen» receipts are reciprocal and can be turned off in Privacy. Contact outside the Platform —WhatsApp, calls, or other means— is outside ContrataCR's control." },
    { k: "p", text: "We may apply automated safeguards, limits, file blocking, and review connected to reports or security. If notifications are enabled, we may send account and marketplace activity alerts. We may also send occasional ContrataCR news by email; you can opt out by replying to any such email, and essential account and security emails still apply." },
  ] },
  { id: "ai", h: "9. Artificial intelligence assistant", body: [
    { k: "p", text: "The assistant can help interpret needs and find services, but may be incomplete or wrong. It is not professional, medical, legal, financial, emergency, or safety advice. Verify information before acting." },
  ] },
  { id: "content", h: "10. Content and intellectual property", body: [
    { k: "p", text: "Users retain ownership of their content and grant ContrataCR a non-exclusive, worldwide, royalty-free license, for as long as needed, to host, technically copy, format, display, distribute within the Platform, moderate, back up, and promote the relevant profile or request." },
    { k: "p", text: "Users represent that they have the required rights. ContrataCR's brand, logo, design, original text, and software belong to ContrataCR or its licensors." },
  ] },
  { id: "moderation", h: "11. Reviews, reports, and moderation", body: [
    { k: "p", text: "ContrataCR has **zero tolerance for objectionable content and abusive users**." },
    { k: "ul", items: ["Reviews must describe genuine experiences respectfully.", "Users may report profiles, messages, reviews, or conduct and immediately block the other person from supported surfaces.", "Reported content may be hidden immediately while it is reviewed.", "ContrataCR seeks to review and act on safety or abuse reports within 24 hours.", "ContrataCR may investigate, limit visibility, remove content, warn, suspend, or terminate accounts for breach, risk, fraud, legal orders, or community protection.", "Where reasonably possible, Users may contact support to request review of an action."] },
  ] },
  { id: "account", h: "12. Account, suspension, and deletion", body: [
    { k: "p", text: "Keep contact information accurate and credentials secure. You can **disable your account** from Account & security. When disabled, your profile is hidden and your session is signed out." },
    { k: "p", text: "If you want **permanent deletion** of the account or specific personal data, you can request it from Account & security or through the public account or data deletion page. If you cannot access your panel, use the prefilled support case available on that page so we can confirm your identity and follow up." },
    { k: "p", text: "Deletion is handled according to the Privacy Policy. Some data may be temporarily retained for security, claims, or legal duties." },
    { k: "p", text: "ContrataCR may suspend or terminate accounts for breach, fraud, risk to others, prolonged inactivity, legal requirements, or harmful use." },
  ] },
  { id: "third-parties", h: "13. Third-party services", body: [
    { k: "p", text: "The Platform relies on authentication, hosting, storage, maps, email, notifications, AI, and other providers. Their terms and policies may also apply. ContrataCR does not control external websites or outages outside its reasonable control." },
  ] },
  { id: "availability", h: "14. Availability and liability", body: [
    { k: "p", text: "We seek to keep the Platform secure and available, but maintenance, errors, interruptions, or temporary loss of features may occur. Continuous, error-free operation is not guaranteed." },
    { k: "p", text: "To the extent permitted by law, ContrataCR is not liable for Professional services, agreements between Users, third-party content, or events outside its reasonable control." },
    { k: "note", text: "**Nothing in these Terms limits rights or responsibilities that Costa Rican law does not allow us to exclude**, including applicable consumer rights." },
  ] },
  { id: "privacy", h: "15. Privacy", body: [{ k: "p", text: "Data processing is governed by the **Privacy Policy**. Device permissions such as location, files, and notifications can be managed through the operating system." }] },
  { id: "changes", h: "16. Changes to these Terms", body: [
    { k: "p", text: "We may update these Terms for legal, security, or product changes. We will publish the current version and date and seek to provide reasonable advance notice of material changes." },
  ] },
  { id: "law", h: "17. Law, disputes, and contact", body: [
    { k: "p", text: "These Terms are governed by Costa Rican law. Disputes are subject to the competent Costa Rican authorities and courts, without limiting non-waivable consumer rights." },
    { k: "p", text: "Questions, reports, or review requests: **soporte@contratacr.com**." },
  ] },
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
      updated={en ? "October 8, 2026" : "8 de octubre de 2026"}
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
