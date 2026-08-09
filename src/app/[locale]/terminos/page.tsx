import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

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
    ],
  },
  {
    id: "pagos",
    h: "4. Contratación y pagos",
    body: [
      { k: "p", text: "El precio, alcance, fecha, garantías, facturación y forma de pago del servicio profesional se acuerdan directamente entre Cliente y Profesional. ContrataCR no procesa ni custodia esos pagos, salvo que una función futura lo indique expresamente mediante condiciones adicionales." },
      { k: "p", text: "ContrataCR no responde por anticipos, falta de pago, cobros indebidos, reembolsos, daños o disputas económicas entre Usuarios. Recomendamos documentar por escrito el alcance y las condiciones antes de iniciar un trabajo." },
    ],
  },
  {
    id: "profesionales",
    h: "5. Obligaciones de los Profesionales",
    body: [
      { k: "ul", items: [
        "Publicar información verdadera, vigente y suficiente sobre sus servicios.",
        "Mantener las licencias, permisos, colegiaturas, seguros o autorizaciones exigidos para su actividad.",
        "No atribuirse certificaciones, experiencia o capacidades que no posee.",
        "Cumplir la legislación laboral, tributaria, sanitaria, profesional y de protección al consumidor que corresponda.",
        "Tratar de forma confidencial y lícita los datos recibidos de Clientes.",
      ] },
      { k: "note", text: "La insignia **Verificado** confirma de manera limitada una coincidencia de identidad. No certifica experiencia, licencias, permisos, calidad ni resultado del servicio." },
    ],
  },
  {
    id: "usuarios",
    h: "6. Reglas de conducta",
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
    h: "7. Mensajes, archivos y notificaciones",
    body: [
      { k: "p", text: "Los mensajes sirven para coordinar servicios. Los participantes son responsables de lo que envían. Puede adjuntar únicamente imágenes o documentos legítimos, necesarios y seguros; no debe incluir información sensible innecesaria." },
      { k: "p", text: "ContrataCR puede aplicar controles automáticos, límites, bloqueo de archivos y revisión asociada a reportes o seguridad. No supervisamos de forma permanente todas las conversaciones." },
      { k: "p", text: "Si activa notificaciones, podemos enviar avisos sobre mensajes, solicitudes, propuestas, citas, reseñas, seguridad y actividad de su cuenta. Puede desactivarlas desde el sistema operativo, aunque ciertos correos esenciales de cuenta o seguridad seguirán enviándose." },
    ],
  },
  {
    id: "ia",
    h: "8. Asistente de inteligencia artificial",
    body: [
      { k: "p", text: "El asistente ayuda a interpretar necesidades y encontrar funciones o servicios, pero sus respuestas pueden ser incompletas o incorrectas. No constituye asesoría profesional, médica, legal, financiera ni de emergencia." },
      { k: "p", text: "Usted debe verificar la información antes de tomar decisiones y no debe enviar al asistente contraseñas, información financiera, números completos de identificación ni datos sensibles innecesarios." },
    ],
  },
  {
    id: "contenido",
    h: "9. Contenido, perfiles y propiedad intelectual",
    body: [
      { k: "p", text: "El Usuario conserva la titularidad de su contenido. Al publicarlo, otorga a ContrataCR una licencia no exclusiva, mundial y gratuita, durante el tiempo necesario para alojarlo, copiarlo técnicamente, adaptarlo a formatos o tamaños, mostrarlo, distribuirlo dentro de la Plataforma, moderarlo y crear copias de respaldo para operar y promocionar su perfil o solicitud." },
      { k: "p", text: "El Usuario declara que posee los derechos y permisos necesarios sobre el contenido publicado. La marca, logotipo, diseño, textos propios y software de ContrataCR pertenecen a ContrataCR o a sus licenciantes y no pueden utilizarse sin autorización." },
    ],
  },
  {
    id: "resenas",
    h: "10. Reseñas, reportes y moderación",
    body: [
      { k: "ul", items: [
        "Las reseñas deben describir experiencias reales y expresarse de forma respetuosa.",
        "Los Usuarios pueden reportar perfiles, clientes, mensajes, reseñas o conductas.",
        "ContrataCR puede investigar, limitar visibilidad, retirar contenido, advertir, suspender o cancelar cuentas cuando exista incumplimiento, riesgo, fraude, orden legal o necesidad de proteger a la comunidad.",
        "Cuando sea razonablemente posible, el Usuario podrá contactar soporte para solicitar revisión de una medida.",
      ] },
    ],
  },
  {
    id: "cuenta",
    h: "11. Cuenta, suspensión y eliminación",
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
    h: "12. Servicios y enlaces de terceros",
    body: [
      { k: "p", text: "La Plataforma depende de proveedores de autenticación, alojamiento, almacenamiento, mapas, correo, notificaciones, IA y otros servicios. Sus condiciones y políticas también pueden aplicar cuando usted utiliza esas funciones." },
      { k: "p", text: "ContrataCR no controla la disponibilidad o el contenido de sitios externos y no responde por interrupciones atribuibles a terceros fuera de nuestro control razonable." },
    ],
  },
  {
    id: "disponibilidad",
    h: "13. Disponibilidad y limitación de responsabilidad",
    body: [
      { k: "p", text: "Procuramos mantener la Plataforma segura y disponible, pero puede presentar mantenimiento, errores, interrupciones o pérdida temporal de funciones. No garantizamos funcionamiento continuo o libre de errores." },
      { k: "p", text: "En la máxima medida permitida por la ley, ContrataCR no responde por daños derivados del servicio prestado por un Profesional, acuerdos entre Usuarios, contenido publicado por terceros o eventos fuera de nuestro control razonable." },
      { k: "note", text: "**Nada en estos Términos limita derechos o responsabilidades que la legislación costarricense no permita excluir**, incluidos los derechos aplicables de protección al consumidor." },
    ],
  },
  {
    id: "privacidad",
    h: "14. Privacidad",
    body: [
      { k: "p", text: "El tratamiento de datos se rige por nuestra **Política de Privacidad**. Al utilizar permisos del dispositivo, como ubicación, archivos o notificaciones, se le mostrará la solicitud correspondiente y podrá administrarla desde el sistema operativo." },
    ],
  },
  {
    id: "cambios",
    h: "15. Cambios en estos Términos",
    body: [
      { k: "p", text: "Podemos actualizar estos Términos para reflejar cambios legales, de seguridad o del producto. Publicaremos la versión y fecha vigentes. Cuando el cambio sea material, procuraremos comunicarlo por un medio razonable antes de su entrada en vigor." },
      { k: "p", text: "El uso continuado después de la entrada en vigor implica aceptación de la versión actualizada. Si no está de acuerdo, puede dejar de usar la Plataforma y solicitar eliminar su cuenta." },
    ],
  },
  {
    id: "ley",
    h: "16. Legislación, controversias y contacto",
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
  ] },
  { id: "payments", h: "4. Hiring and payments", body: [
    { k: "p", text: "Clients and Professionals directly agree on price, scope, timing, warranties, invoicing, and payment. ContrataCR does not process or hold those payments unless a future feature expressly states otherwise under additional terms." },
    { k: "p", text: "ContrataCR is not liable for deposits, non-payment, improper charges, refunds, damages, or financial disputes between Users." },
  ] },
  { id: "professionals", h: "5. Professional obligations", body: [
    { k: "ul", items: ["Publish truthful, current information.", "Maintain licenses, permits, professional registration, insurance, or authorization required for the activity.", "Do not claim qualifications or experience you do not have.", "Comply with applicable labor, tax, health, professional, and consumer law.", "Handle Client data lawfully and confidentially."] },
    { k: "note", text: "The **Verified** badge only confirms a limited identity match. It does not certify experience, licenses, quality, or results." },
  ] },
  { id: "conduct", h: "6. Conduct rules", body: [
    { k: "p", text: "Each User is responsible for their account, published information, and activity." },
    { k: "ul", items: ["No impersonation, fraud, harassment, spam, illegal or dangerous activity.", "No false, misleading, discriminatory, threatening, defamatory, sexually explicit, or unlawful content.", "No unauthorized access, abusive automation, interference, malware, or harmful files.", "No collection, disclosure, or sale of User data outside legitimate service coordination."] },
  ] },
  { id: "messages", h: "7. Messages, files, and notifications", body: [
    { k: "p", text: "Messages are for service coordination. Users are responsible for what they send and may only attach legitimate, necessary, and safe images or documents. Do not include unnecessary sensitive information." },
    { k: "p", text: "We may apply automated safeguards, limits, file blocking, and review connected to reports or security. If notifications are enabled, we may send account and marketplace activity alerts." },
  ] },
  { id: "ai", h: "8. Artificial intelligence assistant", body: [
    { k: "p", text: "The assistant can help interpret needs and find services, but may be incomplete or wrong. It is not professional, medical, legal, financial, emergency, or safety advice. Verify information before acting." },
  ] },
  { id: "content", h: "9. Content and intellectual property", body: [
    { k: "p", text: "Users retain ownership of their content and grant ContrataCR a non-exclusive, worldwide, royalty-free license, for as long as needed, to host, technically copy, format, display, distribute within the Platform, moderate, back up, and promote the relevant profile or request." },
    { k: "p", text: "Users represent that they have the required rights. ContrataCR's brand, logo, design, original text, and software belong to ContrataCR or its licensors." },
  ] },
  { id: "moderation", h: "10. Reviews, reports, and moderation", body: [
    { k: "ul", items: ["Reviews must describe genuine experiences respectfully.", "Users may report profiles, messages, reviews, or conduct.", "ContrataCR may investigate, limit visibility, remove content, warn, suspend, or terminate accounts for breach, risk, fraud, legal orders, or community protection.", "Where reasonably possible, Users may contact support to request review of an action."] },
  ] },
  { id: "account", h: "11. Account, suspension, and deletion", body: [
    { k: "p", text: "Keep contact information accurate and credentials secure. You can **disable your account** from Account & security. When disabled, your profile is hidden and your session is signed out." },
    { k: "p", text: "If you want **permanent deletion** of the account or specific personal data, you can request it from Account & security or through the public account or data deletion page. If you cannot access your panel, use the prefilled support case available on that page so we can confirm your identity and follow up." },
    { k: "p", text: "Deletion is handled according to the Privacy Policy. Some data may be temporarily retained for security, claims, or legal duties." },
    { k: "p", text: "ContrataCR may suspend or terminate accounts for breach, fraud, risk to others, prolonged inactivity, legal requirements, or harmful use." },
  ] },
  { id: "third-parties", h: "12. Third-party services", body: [
    { k: "p", text: "The Platform relies on authentication, hosting, storage, maps, email, notifications, AI, and other providers. Their terms and policies may also apply. ContrataCR does not control external websites or outages outside its reasonable control." },
  ] },
  { id: "availability", h: "13. Availability and liability", body: [
    { k: "p", text: "We seek to keep the Platform secure and available, but maintenance, errors, interruptions, or temporary loss of features may occur. Continuous, error-free operation is not guaranteed." },
    { k: "p", text: "To the extent permitted by law, ContrataCR is not liable for Professional services, agreements between Users, third-party content, or events outside its reasonable control." },
    { k: "note", text: "**Nothing in these Terms limits rights or responsibilities that Costa Rican law does not allow us to exclude**, including applicable consumer rights." },
  ] },
  { id: "privacy", h: "14. Privacy", body: [{ k: "p", text: "Data processing is governed by the **Privacy Policy**. Device permissions such as location, files, and notifications can be managed through the operating system." }] },
  { id: "changes", h: "15. Changes to these Terms", body: [
    { k: "p", text: "We may update these Terms for legal, security, or product changes. We will publish the current version and date and seek to provide reasonable advance notice of material changes." },
  ] },
  { id: "law", h: "16. Law, disputes, and contact", body: [
    { k: "p", text: "These Terms are governed by Costa Rican law. Disputes are subject to the competent Costa Rican authorities and courts, without limiting non-waivable consumer rights." },
    { k: "p", text: "Questions, reports, or review requests: **soporte@contratacr.com**." },
  ] },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en"
    ? { title: "Terms and Conditions - ContrataCR", description: "Terms governing use of ContrataCR." }
    : { title: "Términos y Condiciones - ContrataCR", description: "Condiciones que regulan el uso de ContrataCR." };
}

export default async function TerminosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return (
    <LegalDocument
      title={en ? "Terms and Conditions" : "Términos y Condiciones"}
      updated={en ? "July 23, 2026" : "23 de julio de 2026"}
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
