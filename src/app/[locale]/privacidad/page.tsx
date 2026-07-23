import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

const ES_SECTIONS: LegalSection[] = [
  {
    id: "responsable",
    h: "1. Responsable y alcance",
    body: [
      { k: "p", text: "El responsable del tratamiento es **ContrataCR**, servicio disponible en contratacr.com y en sus aplicaciones móviles. Para consultas o solicitudes de privacidad puede escribir a **soporte@contratacr.com**." },
      { k: "p", text: "Esta Política se aplica al sitio web, las aplicaciones móviles y las funciones asociadas de ContrataCR. El tratamiento se realiza conforme a la Ley N.º 8968 de Costa Rica y su reglamento." },
    ],
  },
  {
    id: "datos",
    h: "2. Datos que tratamos",
    body: [
      { k: "sub", text: "2.1 Cuenta e identidad" },
      { k: "ul", items: [
        "Nombre, correo electrónico, teléfono y datos básicos compartidos por proveedores de inicio de sesión, como Google.",
        "Credenciales de acceso administradas de forma segura por nuestro proveedor de autenticación. ContrataCR no conserva su contraseña en texto legible.",
        "Número de identificación cuando usted decide aportarlo o cuando sea necesario para una solicitud. Para la insignia Verificado conservamos el número de forma protegida y el resultado de la comprobación.",
      ] },
      { k: "sub", text: "2.2 Actividad como Cliente" },
      { k: "ul", items: [
        "Solicitudes, publicaciones, propuestas recibidas, citas, reseñas y profesionales guardados.",
        "Información incluida por usted en descripciones, notas, reportes y conversaciones.",
        "Zona, ubicación o punto geográfico cuando lo proporciona o autoriza.",
      ] },
      { k: "sub", text: "2.3 Perfil profesional" },
      { k: "ul", items: [
        "Nombre o nombre comercial, servicios, descripción, teléfonos, correo de contacto y enlaces profesionales.",
        "Provincia, cantón, lugares de trabajo, zonas de cobertura y, si lo agrega, un punto en el mapa.",
        "Fotografía de perfil, portafolio, certificaciones, idiomas, aseguradoras, disponibilidad y horarios.",
        "Solicitudes recibidas, propuestas, reseñas, casos de éxito y demás actividad relacionada con su perfil.",
      ] },
      { k: "sub", text: "2.4 Mensajes, soporte y archivos" },
      { k: "ul", items: [
        "Mensajes enviados dentro de ContrataCR y datos necesarios para identificar a los participantes y el contexto de la conversación.",
        "Imágenes y documentos PDF que usted adjunte en mensajes o solicitudes de soporte.",
        "Consultas, tickets, reportes y comunicaciones con soporte.",
      ] },
      { k: "sub", text: "2.5 Asistente de inteligencia artificial" },
      { k: "p", text: "Tratamos las consultas enviadas al asistente, sus respuestas y, si usted inició sesión, el historial que decida conservar. No incluya contraseñas, números completos de identificación, información financiera ni otros datos sensibles que no sean necesarios." },
      { k: "sub", text: "2.6 Dispositivo, uso y analítica" },
      { k: "ul", items: [
        "Dirección IP, tipo de dispositivo y navegador, sistema operativo, idioma, versión de la aplicación, identificadores técnicos y registros de seguridad.",
        "Interacciones con perfiles, servicios, botones de contacto, favoritos, solicitudes y funciones de la Plataforma.",
        "Token de notificaciones push, plataforma, identificador del dispositivo y estado del permiso cuando activa notificaciones.",
        "Cookies y tecnologías similares necesarias para sesión, idioma, seguridad y funcionamiento; además de medición publicitaria cuando corresponda.",
      ] },
    ],
  },
  {
    id: "finalidades",
    h: "3. Para qué usamos los datos",
    body: [
      { k: "ul", items: [
        "Crear, autenticar y administrar su cuenta.",
        "Publicar perfiles profesionales y conectar Clientes con Profesionales.",
        "Gestionar búsquedas, solicitudes, citas, propuestas, mensajes, archivos, reseñas y soporte.",
        "Personalizar resultados según servicio, zona y preferencias indicadas.",
        "Enviar correos y notificaciones relacionados con su cuenta o actividad.",
        "Operar el asistente de IA y conservar su historial cuando corresponda.",
        "Medir el uso, mejorar el producto y evaluar campañas de adquisición.",
        "Prevenir fraude, abuso, suplantación y fallos de seguridad.",
        "Cumplir obligaciones legales y atender requerimientos de autoridades competentes.",
      ] },
      { k: "note", text: "**No vendemos sus datos personales.** Tampoco permitimos que terceros utilicen el contenido privado de sus conversaciones para enviarle publicidad." },
    ],
  },
  {
    id: "publicos",
    h: "4. Información pública",
    body: [
      { k: "p", text: "Los perfiles profesionales publicados pueden ser visibles sin iniciar sesión, compartirse mediante enlaces y aparecer en motores de búsqueda. Esto puede incluir nombre o nombre comercial, fotografía, servicios, zona general, descripción, portafolio, disponibilidad pública, reseñas e insignias." },
      { k: "p", text: "No mostramos públicamente contraseñas, tokens, el número completo de identificación, conversaciones privadas ni documentos privados. Usted debe evitar publicar en campos públicos información que no desea difundir." },
    ],
  },
  {
    id: "proveedores",
    h: "5. Proveedores y transferencias",
    body: [
      { k: "p", text: "Utilizamos proveedores tecnológicos para operar la Plataforma. Según la función utilizada, pueden intervenir:" },
      { k: "ul", items: [
        "**Supabase:** autenticación, base de datos y almacenamiento privado.",
        "**Vercel:** alojamiento y entrega de la aplicación web.",
        "**Cloudinary:** procesamiento y alojamiento de imágenes y determinados archivos.",
        "**Firebase:** entrega de notificaciones push.",
        "**OpenAI:** procesamiento de consultas dirigidas al asistente.",
        "**Google y proveedores de mapas:** inicio de sesión, mapas, ubicación y servicios relacionados.",
        "**Meta:** medición de campañas mediante Meta Pixel para entender el rendimiento de nuestros anuncios.",
        "Proveedores de correo y otros servicios necesarios para comunicaciones, seguridad y soporte.",
      ] },
      { k: "p", text: "Algunos proveedores pueden procesar datos fuera de Costa Rica. Procuramos trabajar con proveedores que ofrecen medidas contractuales, técnicas y organizativas apropiadas. También podemos comunicar información a autoridades cuando exista una obligación legal." },
    ],
  },
  {
    id: "cookies",
    h: "6. Cookies, analítica y publicidad",
    body: [
      { k: "p", text: "Usamos cookies o almacenamiento local necesarios para mantener la sesión, recordar el idioma, conservar preferencias, proteger la cuenta y mejorar el rendimiento." },
      { k: "p", text: "También medimos visitas y acciones para comprender el uso de ContrataCR y el rendimiento de campañas. Meta Pixel puede informar a Meta que una visita o acción ocurrió en ContrataCR. No recibe el contenido privado de sus mensajes, solicitudes, propuestas ni conversaciones." },
      { k: "p", text: "Puede limitar cookies desde su navegador y gestionar permisos de ubicación y notificaciones desde el sistema operativo. Desactivar tecnologías necesarias puede afectar algunas funciones." },
    ],
  },
  {
    id: "conservacion",
    h: "7. Conservación y eliminación",
    body: [
      { k: "ul", items: [
        "Los datos de cuenta y perfil se conservan mientras la cuenta permanezca activa.",
        "Solicitudes, mensajes, archivos, reseñas y reportes se conservan mientras sean necesarios para prestar el servicio, mantener la seguridad, resolver disputas o cumplir obligaciones.",
        "Los tokens push se desactivan cuando dejan de ser válidos y se eliminan cuando ya no son necesarios.",
        "Los registros técnicos y analíticos se conservan durante períodos razonables para seguridad, diagnóstico y medición, y pueden anonimizarse.",
        "Las copias de respaldo pueden tardar un período adicional razonable en desaparecer.",
      ] },
      { k: "p", text: "Cuando solicite eliminar su cuenta o datos personales específicos, eliminaremos o anonimizaremos la información aplicable, salvo la información que debamos conservar temporalmente por seguridad, prevención de fraude, atención de reclamos u obligación legal. También solicitaremos la eliminación aplicable a nuestros proveedores." },
    ],
  },
  {
    id: "derechos",
    h: "8. Sus derechos y solicitudes",
    body: [
      { k: "p", text: "Conforme a la Ley N.º 8968, puede solicitar acceso, rectificación, actualización, supresión o eliminación de sus datos y oponerse a determinados tratamientos cuando proceda." },
      { k: "p", text: "Puede actualizar varios datos desde su cuenta. Para otras solicitudes, escriba a **soporte@contratacr.com**. Podremos pedir información razonable para confirmar su identidad. Atenderemos la solicitud dentro del plazo legal aplicable." },
      { k: "p", text: "La eliminación de cuenta o datos personales específicos puede solicitarse desde Cuenta y seguridad o mediante la página pública de eliminación de cuenta o datos." },
    ],
  },
  {
    id: "seguridad",
    h: "9. Seguridad e incidentes",
    body: [
      { k: "p", text: "Aplicamos controles de acceso, cifrado en tránsito, restricciones sobre datos sensibles, validación de archivos y otras medidas razonables. Ningún sistema es completamente infalible. Si detectamos un incidente que requiera comunicación, actuaremos conforme a la legislación aplicable." },
      { k: "p", text: "Usted debe proteger sus credenciales, mantener actualizado su dispositivo y notificarnos si sospecha un acceso no autorizado." },
    ],
  },
  {
    id: "decisiones",
    h: "10. IA y decisiones automatizadas",
    body: [
      { k: "p", text: "El asistente puede interpretar necesidades y sugerir servicios o enlaces, pero puede equivocarse. Sus respuestas son informativas y no sustituyen asesoría profesional, médica, legal, financiera o de seguridad." },
      { k: "p", text: "ContrataCR no utiliza el asistente para tomar decisiones con efectos legales sobre usted. Las acciones de moderación o verificación pueden apoyarse en señales automáticas, pero procuramos que exista revisión cuando una decisión relevante lo amerite." },
    ],
  },
  {
    id: "menores",
    h: "11. Menores de edad",
    body: [{ k: "p", text: "ContrataCR está dirigido a personas mayores de 18 años. No recolectamos intencionalmente datos de menores. Si considera que un menor creó una cuenta, contáctenos para revisarla." }],
  },
  {
    id: "cambios",
    h: "12. Cambios y contacto",
    body: [
      { k: "p", text: "Podemos actualizar esta Política para reflejar cambios legales o del producto. Publicaremos la nueva versión y su fecha. Cuando el cambio sea material, procuraremos comunicarlo por un medio razonable antes de que entre en vigor." },
      { k: "p", text: "Consultas y solicitudes: **soporte@contratacr.com**." },
    ],
  },
];

const EN_SECTIONS: LegalSection[] = [
  { id: "controller", h: "1. Controller and scope", body: [
    { k: "p", text: "The data controller is **ContrataCR**, available at contratacr.com and through its mobile applications. Contact **soporte@contratacr.com** for privacy questions or requests." },
    { k: "p", text: "This Policy applies to ContrataCR's website, mobile applications, and related features. Processing is governed by Costa Rican Law No. 8968 and its regulations." },
  ] },
  { id: "data", h: "2. Data we process", body: [
    { k: "sub", text: "2.1 Account and identity" },
    { k: "ul", items: ["Name, email, phone number, and basic data shared by sign-in providers such as Google.", "Credentials securely managed by our authentication provider. ContrataCR does not keep your password in readable text.", "Identification number when you choose to provide it or when needed for a request, plus the protected verification result."] },
    { k: "sub", text: "2.2 Client and Professional activity" },
    { k: "ul", items: ["Requests, posts, appointments, proposals, reviews, saved professionals, and related activity.", "Professional profile data, services, location, work areas, portfolio, availability, and contact details.", "Content you include in descriptions, notes, reports, and conversations."] },
    { k: "sub", text: "2.3 Messages, files, support, and AI" },
    { k: "ul", items: ["Private messages and the data needed to identify participants and conversation context.", "Images and PDF documents attached to messages or support requests.", "AI assistant prompts, responses, and saved history when you are signed in. Do not submit unnecessary sensitive information."] },
    { k: "sub", text: "2.4 Device, location, and usage" },
    { k: "ul", items: ["IP address, device and browser type, operating system, language, app version, technical identifiers, and security logs.", "Location when you provide it or grant permission.", "Push token, platform, device identifier, and permission status when notifications are enabled.", "Interactions, cookies, local storage, analytics, and campaign measurement data."] },
  ] },
  { id: "purposes", h: "3. Why we use data", body: [
    { k: "ul", items: ["Create and secure accounts.", "Publish professional profiles and connect Clients with Professionals.", "Operate search, requests, appointments, proposals, messages, files, reviews, support, AI, and notifications.", "Personalize results, measure product use, improve the service, and assess acquisition campaigns.", "Prevent fraud, abuse, impersonation, and security incidents.", "Comply with legal obligations and lawful authority requests."] },
    { k: "note", text: "**We do not sell personal data.** We do not allow third parties to use private conversation content to send advertising." },
  ] },
  { id: "public", h: "4. Public information", body: [
    { k: "p", text: "Published Professional profiles may be visible without signing in, shared through links, and indexed by search engines. Public information may include name or business name, photo, services, general area, description, portfolio, public availability, reviews, and badges." },
    { k: "p", text: "Passwords, tokens, full identification numbers, private conversations, and private documents are not displayed publicly." },
  ] },
  { id: "providers", h: "5. Providers and transfers", body: [
    { k: "p", text: "Depending on the feature, we use providers including **Supabase** (authentication, database, private storage), **Vercel** (hosting), **Cloudinary** (media), **Firebase** (push notifications), **OpenAI** (assistant), Google and map providers, Meta (campaign measurement), and email or support providers." },
    { k: "p", text: "Some providers may process data outside Costa Rica. We seek providers with appropriate contractual, technical, and organizational safeguards. We may also disclose information when legally required." },
  ] },
  { id: "cookies", h: "6. Cookies, analytics, and advertising", body: [
    { k: "p", text: "We use cookies or local storage for session, language, preferences, security, and performance. We also measure visits and actions. Meta Pixel may tell Meta that a visit or action occurred on ContrataCR, but it does not receive private messages, requests, proposals, or conversation content." },
    { k: "p", text: "You can manage cookies in your browser and location or notification permissions in your operating system. Disabling necessary technologies may affect functionality." },
  ] },
  { id: "retention", h: "7. Retention and deletion", body: [
    { k: "p", text: "Account and profile data is retained while the account is active. Requests, messages, files, reviews, reports, and technical records are kept for the time reasonably needed to provide the service, maintain security, resolve disputes, or comply with legal duties. Backups may take additional reasonable time to expire." },
    { k: "p", text: "Following an account or specific personal data deletion request, we delete or anonymize the applicable information except data temporarily retained for security, fraud prevention, claims, or legal compliance. We also request applicable deletion from our providers." },
  ] },
  { id: "rights", h: "8. Your rights and requests", body: [
    { k: "p", text: "Under Costa Rican Law No. 8968, you may request access, correction, update, suppression or deletion, and object to certain processing where applicable." },
    { k: "p", text: "Update available data from your account or contact **soporte@contratacr.com**. We may reasonably verify your identity and will respond within the applicable legal period. Account deletion or deletion of specific personal data can be requested from Account & security or through the public account or data deletion page." },
  ] },
  { id: "security", h: "9. Security and incidents", body: [
    { k: "p", text: "We use access controls, encryption in transit, restrictions on sensitive data, file validation, and other reasonable safeguards. No system is infallible. We will act under applicable law if an incident requires notice." },
  ] },
  { id: "ai", h: "10. AI and automated decisions", body: [
    { k: "p", text: "The assistant may suggest services or links but can be wrong. Its responses are informational and do not replace professional, medical, legal, financial, or safety advice. ContrataCR does not use the assistant to make decisions with legal effects about you." },
  ] },
  { id: "minors", h: "11. Minors", body: [{ k: "p", text: "ContrataCR is intended for people over 18. We do not knowingly collect data from minors. Contact us if you believe a minor created an account." }] },
  { id: "changes", h: "12. Changes and contact", body: [
    { k: "p", text: "We may update this Policy to reflect legal or product changes. We will publish the new version and date and seek to provide reasonable advance notice of material changes." },
    { k: "p", text: "Questions and requests: **soporte@contratacr.com**." },
  ] },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en"
    ? { title: "Privacy Policy - ContrataCR", description: "How ContrataCR processes and protects personal data." }
    : { title: "Política de Privacidad - ContrataCR", description: "Cómo ContrataCR trata y protege sus datos personales." };
}

export default async function PrivacidadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return (
    <LegalDocument
      title={en ? "Privacy Policy" : "Política de Privacidad"}
      updated={en ? "July 23, 2026" : "23 de julio de 2026"}
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
