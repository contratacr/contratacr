import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

const ES_SECTIONS: LegalSection[] = [
  { id: "responsable", h: "1. Responsable del tratamiento", body: [{ k: "p", text: "El responsable del tratamiento de sus datos personales es **ContrataCR** (contratacr.com). Para cualquier asunto relacionado con sus datos, puede contactarnos en: **soporte@contratacr.com**" }] },
  { id: "datos", h: "2. Que datos recolectamos", body: [
    { k: "p", text: "Recolectamos unicamente los datos necesarios para prestar nuestro servicio de intermediacion:" },
    { k: "sub", text: "2.1 De todos los Usuarios" },
    { k: "ul", items: ["Nombre.", "Correo electronico.", "Contrasena (almacenada de forma cifrada; nunca la vemos ni la guardamos en texto legible).", "Datos basicos compartidos por Google o Facebook cuando el Usuario se registra con esos proveedores."] },
    { k: "sub", text: "2.2 De los Clientes" },
    { k: "ul", items: ["Numero de telefono / WhatsApp para coordinar servicios.", "Numero de identificacion, cuando lo proporciona al solicitar un servicio.", "Ubicacion o zona, cuando la indica.", "Historial de solicitudes, publicaciones y profesionales guardados dentro de la Plataforma."] },
    { k: "sub", text: "2.3 De los Profesionales" },
    { k: "ul", items: ["Numero de identificacion (opcional; quienes lo aportan pueden obtener la insignia de identidad verificada).", "Nombre comercial o marca (opcional).", "Profesion(es) y servicios ofrecidos.", "Numero de telefono / WhatsApp y, opcionalmente, numero para llamadas y correo de contacto.", "Ubicacion: provincia, canton y, opcionalmente, un punto en el mapa.", "Zonas de cobertura.", "Fotografia de perfil.", "Descripcion, certificaciones en texto, fotografias de casos de exito, aseguradoras con las que trabaja e idiomas.", "Disponibilidad y horarios."] },
    { k: "sub", text: "2.4 Datos de uso" },
    { k: "ul", items: ["Informacion tecnica basica generada por el uso de la Plataforma, necesaria para el funcionamiento del servicio."] },
    { k: "sub", text: "2.5 Verificacion de identidad" },
    { k: "p", text: "Cuando un Usuario aporta su identificacion, consultamos su validez contra registros oficiales para confirmar que el numero es real y que el nombre coincide. **Almacenamos unicamente el resultado de esa verificacion y el numero de identificacion de forma protegida**. Aplicamos el principio de minimizacion: no guardamos mas datos de los necesarios." },
  ] },
  { id: "uso", h: "3. Para que usamos sus datos", body: [{ k: "ul", items: [
    "Crear y gestionar su cuenta.",
    "Permitir la conexion entre Clientes y Profesionales.",
    "Realizar la verificacion de identidad cuando aplica.",
    "Enviar notificaciones y comunicaciones relacionadas con el servicio.",
    "Atender consultas, reportes y solicitudes de soporte.",
    "Mantener la seguridad y el correcto funcionamiento de la Plataforma.",
    "Cumplir con obligaciones legales.",
  ] }, { k: "p", text: "**No vendemos sus datos personales.** No mostramos publicidad de terceros que pague por promocionarse dentro de las conversaciones o el contenido de la Plataforma." }] },
  { id: "publicos", h: "4. Datos que se muestran publicamente", body: [{ k: "p", text: "El perfil de un Profesional es publico dentro de la Plataforma: su nombre o nombre comercial, profesion, servicios, ubicacion general, descripcion, fotografias, resenas y la insignia de identidad verificada, si aplica, son visibles para los Clientes. Los datos sensibles, como el numero completo de identificacion, no se muestran publicamente." }] },
  { id: "comparticion", h: "5. Con quien compartimos sus datos", body: [{ k: "ul", items: [
    "**Entre Usuarios:** los datos de contacto se comparten entre Cliente y Profesional cuando ambos deciden coordinar un servicio.",
    "**Proveedores tecnologicos:** usamos servicios de terceros para alojamiento, imagenes, mapas, correo y funcionamiento de la Plataforma. Estos proveedores tratan datos siguiendo nuestras instrucciones.",
    "**Autoridades:** cuando una autoridad competente lo requiera conforme a la ley.",
  ] }, { k: "p", text: "No transferimos sus datos a terceros con fines comerciales ajenos a la prestacion del servicio." }] },
  { id: "conservacion", h: "6. Conservacion de los datos", body: [{ k: "p", text: "Conservamos sus datos mientras su cuenta este activa y durante el tiempo necesario para cumplir con las finalidades descritas o con obligaciones legales." }] },
  { id: "derechos", h: "7. Sus derechos", body: [
    { k: "p", text: "Conforme a la Ley N.º 8968, usted tiene derecho a acceder, rectificar, cancelar o eliminar sus datos cuando proceda, y oponerse a ciertos tratamientos." },
    { k: "p", text: "Para ejercer estos derechos, escribanos a **soporte@contratacr.com**." },
  ] },
  { id: "seguridad", h: "8. Seguridad", body: [{ k: "p", text: "Aplicamos medidas tecnicas y organizativas razonables para proteger sus datos, incluyendo cifrado, control de acceso y restriccion de acceso a datos sensibles. Ningun sistema es completamente infalible, pero trabajamos para proteger su informacion." }] },
  { id: "menores", h: "9. Menores de edad", body: [{ k: "p", text: "ContrataCR esta dirigido a personas mayores de 18 anos. No recolectamos intencionalmente datos de menores de edad." }] },
  { id: "cambios", h: "10. Cambios a esta Politica", body: [{ k: "p", text: "Podemos actualizar esta Politica. Publicaremos los cambios en la Plataforma con la fecha de actualizacion." }] },
  { id: "contacto", h: "11. Contacto", body: [{ k: "p", text: "Para consultas sobre privacidad o para ejercer sus derechos, contactenos en: **soporte@contratacr.com**" }] },
];

const EN_SECTIONS: LegalSection[] = [
  { id: "controller", h: "1. Data controller", body: [{ k: "p", text: "The controller of your personal data is **ContrataCR** (contratacr.com). For any data-related matter, contact us at: **soporte@contratacr.com**" }] },
  { id: "data", h: "2. What data we collect", body: [
    { k: "p", text: "We collect only the data necessary to provide our intermediation service:" },
    { k: "sub", text: "2.1 From all Users" },
    { k: "ul", items: ["Name.", "Email address.", "Password (stored in encrypted form; we never see or store it in readable text).", "Basic data shared by Google or Facebook when the User registers with those providers."] },
    { k: "sub", text: "2.2 From Clients" },
    { k: "ul", items: ["Phone / WhatsApp number to coordinate services.", "Identification number, when provided to request a service.", "Location or service area, when provided.", "History of requests, posted requests, and saved professionals within the Platform."] },
    { k: "sub", text: "2.3 From Professionals" },
    { k: "ul", items: ["Identification number (optional; those who provide it may obtain the identity-verified badge).", "Business or brand name (optional).", "Profession(s) and services offered.", "Phone / WhatsApp number and, optionally, a call number and contact email.", "Location: province, canton, and optionally a map point.", "Coverage areas.", "Profile photo.", "Description, text certifications, success-story photos, accepted insurers where applicable, and languages.", "Availability and schedules."] },
    { k: "sub", text: "2.4 Usage data" },
    { k: "ul", items: ["Basic technical information generated by using the Platform, needed for the service to function."] },
    { k: "sub", text: "2.5 Identity verification" },
    { k: "p", text: "When a User provides identification, we check its validity against official records to confirm that the number is real and that the name matches. **We store only the verification result and the identification number in protected form**. We apply data minimization and do not keep more data than necessary." },
  ] },
  { id: "use", h: "3. How we use your data", body: [{ k: "ul", items: [
    "Create and manage your account.",
    "Connect Clients and Professionals.",
    "Perform identity verification where applicable.",
    "Send service-related notifications and communications.",
    "Handle questions, reports, and support requests.",
    "Maintain Platform security and proper operation.",
    "Comply with legal obligations.",
  ] }, { k: "p", text: "**We do not sell your personal data.** We do not display third-party advertising paid to be promoted inside conversations or Platform content." }] },
  { id: "public", h: "4. Data shown publicly", body: [{ k: "p", text: "A Professional profile is public within the Platform: name or business name, profession, services, general location, description, photos, reviews, and the identity-verified badge, where applicable, are visible to Clients. Sensitive data, such as the full identification number, is not shown publicly." }] },
  { id: "sharing", h: "5. Who we share data with", body: [{ k: "ul", items: [
    "**Between Users:** contact data is shared between Client and Professional when both decide to coordinate a service.",
    "**Technology providers:** we use third-party services for hosting, images, maps, email, and Platform operation. These providers process data under our instructions.",
    "**Authorities:** when required by a competent authority under the law.",
  ] }, { k: "p", text: "We do not transfer your data to third parties for commercial purposes unrelated to providing the service." }] },
  { id: "retention", h: "6. Data retention", body: [{ k: "p", text: "We keep your data while your account is active and for as long as necessary to fulfill the purposes described or legal obligations." }] },
  { id: "rights", h: "7. Your rights", body: [
    { k: "p", text: "Under Costa Rican Law No. 8968, you have the right to access, correct, cancel or delete your data where applicable, and object to certain processing." },
    { k: "p", text: "To exercise these rights, write to **soporte@contratacr.com**." },
  ] },
  { id: "security", h: "8. Security", body: [{ k: "p", text: "We apply reasonable technical and organizational measures to protect your data, including encryption, access control, and restricted access to sensitive data. No system is completely infallible, but we work to protect your information." }] },
  { id: "minors", h: "9. Minors", body: [{ k: "p", text: "ContrataCR is intended for people over 18 years old. We do not intentionally collect data from minors." }] },
  { id: "changes", h: "10. Changes to this Policy", body: [{ k: "p", text: "We may update this Policy. Changes will be published on the Platform with their update date." }] },
  { id: "contact", h: "11. Contact", body: [{ k: "p", text: "For privacy questions or to exercise your rights, contact us at: **soporte@contratacr.com**" }] },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en"
    ? {
        title: "Privacy Policy — ContrataCR",
        description: "How ContrataCR handles and protects personal data under Costa Rican Law No. 8968.",
      }
    : {
        title: "Politica de Privacidad — ContrataCR",
        description: "Como ContrataCR trata y protege tus datos personales, conforme a la Ley N.º 8968 de Costa Rica.",
      };
}

export default async function PrivacidadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return (
    <LegalDocument
      title={en ? "Privacy Policy" : "Politica de Privacidad"}
      updated={en ? "June 14, 2026 · Costa Rican Law No. 8968" : "14 de junio de 2026 · Ley N.º 8968 (Costa Rica)"}
      intro={en
        ? "At ContrataCR, we respect your privacy and protect your personal data under Costa Rican Law No. 8968 and its regulations. This Policy explains what data we collect, how we use it, and what rights you have."
        : "En ContrataCR respetamos su privacidad y protegemos sus datos personales conforme a la Ley N.º 8968 de Proteccion de la Persona frente al tratamiento de sus datos personales y su reglamento. Esta Politica explica que datos recolectamos, para que los usamos y cuales son sus derechos."}
      sections={en ? EN_SECTIONS : ES_SECTIONS}
      footer={en ? (
        <>
          Also review our{" "}
          <Link href="/terminos" className="font-semibold text-[#009FD9] hover:underline">Terms and Conditions</Link>.
        </>
      ) : (
        <>
          Revisa tambien nuestros{" "}
          <Link href="/terminos" className="font-semibold text-[#009FD9] hover:underline">Terminos y Condiciones</Link>.
        </>
      )}
    />
  );
}
