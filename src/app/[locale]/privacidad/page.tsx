import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

export const metadata = {
  title: "Política de Privacidad — ContrataCR",
  description: "Cómo ContrataCR trata y protege tus datos personales, conforme a la Ley N.º 8968 de Costa Rica.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "responsable",
    h: "1. Responsable del tratamiento",
    body: [
      { k: "p", text: "El responsable del tratamiento de sus datos personales es **ContrataCR** (contratacr.com). Para cualquier asunto relacionado con sus datos, puede contactarnos en: **soporte@contratacr.com**" },
    ],
  },
  {
    id: "datos",
    h: "2. Qué datos recolectamos",
    body: [
      { k: "p", text: "Recolectamos únicamente los datos necesarios para prestar nuestro servicio de intermediación:" },
      { k: "sub", text: "2.1 De todos los Usuarios" },
      { k: "ul", items: [
        "Nombre.",
        "Correo electrónico.",
        "Contraseña (almacenada de forma cifrada; nunca la vemos ni la guardamos en texto legible).",
        "En caso de registrarse con Google o Facebook, los datos básicos que ese proveedor nos comparte (nombre, correo).",
      ] },
      { k: "sub", text: "2.2 De los Clientes" },
      { k: "ul", items: [
        "Número de teléfono / WhatsApp (para coordinar servicios).",
        "Número de identificación, cuando lo proporciona al solicitar un servicio.",
        "Ubicación o zona, cuando la indica.",
        "Historial de solicitudes, solicitudes publicadas y profesionales guardados dentro de la Plataforma.",
      ] },
      { k: "sub", text: "2.3 De los Profesionales" },
      { k: "ul", items: [
        "Número de identificación (opcional; quienes la aportan pueden obtener la insignia de identidad verificada).",
        "Nombre comercial o marca (opcional).",
        "Profesión(es) y servicios ofrecidos.",
        "Número de teléfono / WhatsApp y, opcionalmente, número para llamadas y correo de contacto.",
        "Ubicación: provincia, cantón y, opcionalmente, un punto en el mapa.",
        "Zonas de cobertura.",
        "Fotografía de perfil.",
        "Descripción, certificaciones (texto), fotografías de casos de éxito, aseguradoras con las que trabaja (en su caso) e idiomas.",
        "Disponibilidad y horarios.",
      ] },
      { k: "sub", text: "2.4 Datos de uso" },
      { k: "ul", items: [
        "Información técnica básica generada por el uso de la Plataforma (por ejemplo, datos de navegación necesarios para el funcionamiento del servicio).",
      ] },
      { k: "sub", text: "2.5 Verificación de identidad" },
      { k: "p", text: "Cuando un Usuario aporta su identificación, consultamos su validez contra registros oficiales para confirmar que el número es real y que el nombre coincide. **Almacenamos únicamente el resultado de esa verificación y el número de identificación de forma protegida** (mostrándolo de forma enmascarada, p. ej. X-XXXX-0000). Aplicamos el principio de minimización: no guardamos más datos de los necesarios." },
    ],
  },
  {
    id: "uso",
    h: "3. Para qué usamos sus datos",
    body: [
      { k: "p", text: "Utilizamos sus datos exclusivamente para:" },
      { k: "ul", items: [
        "Crear y gestionar su cuenta.",
        "Permitir la conexión entre Clientes y Profesionales (mostrar perfiles, permitir contacto y coordinación).",
        "Realizar la verificación de identidad (cuando aplica).",
        "Enviar notificaciones y comunicaciones relacionadas con el servicio (por ejemplo, confirmación de correo, avisos de solicitudes, respuestas de soporte).",
        "Atender consultas, reportes y solicitudes de soporte.",
        "Mantener la seguridad y el correcto funcionamiento de la Plataforma.",
        "Cumplir con obligaciones legales.",
      ] },
      { k: "p", text: "**No vendemos sus datos personales.** No mostramos publicidad de terceros que pague por promocionarse dentro de las conversaciones o el contenido de la Plataforma." },
    ],
  },
  {
    id: "publicos",
    h: "4. Datos que se muestran públicamente",
    body: [
      { k: "p", text: "Tenga en cuenta que **el perfil de un Profesional es público** dentro de la Plataforma: su nombre (o nombre comercial), profesión, servicios, ubicación general (provincia/cantón), descripción, fotografías, reseñas y la insignia de identidad verificada (si aplica) son visibles para los Clientes, ya que esa es la finalidad del servicio. Los datos sensibles (como el número completo de identificación) **no se muestran públicamente**; la identificación solo se exhibe de forma enmascarada al propio titular." },
    ],
  },
  {
    id: "comparticion",
    h: "5. Con quién compartimos sus datos",
    body: [
      { k: "p", text: "Compartimos datos únicamente cuando es necesario para el servicio o por obligación legal:" },
      { k: "ul", items: [
        "**Entre Usuarios:** los datos de contacto se comparten entre Cliente y Profesional cuando ambos deciden coordinar un servicio (por ejemplo, el número de WhatsApp).",
        "**Proveedores tecnológicos:** utilizamos servicios de terceros para funcionar (por ejemplo, alojamiento de datos, almacenamiento de imágenes y mapas). Estos proveedores tratan los datos siguiendo nuestras instrucciones y con medidas de seguridad.",
        "**Autoridades:** cuando una autoridad competente lo requiera conforme a la ley.",
      ] },
      { k: "p", text: "No transferimos sus datos a terceros con fines comerciales ajenos a la prestación del servicio." },
    ],
  },
  {
    id: "conservacion",
    h: "6. Conservación de los datos",
    body: [
      { k: "p", text: "Conservamos sus datos mientras su cuenta esté activa y durante el tiempo necesario para cumplir con las finalidades descritas o con obligaciones legales. Si cierra o desactiva su cuenta, sus datos dejan de mostrarse y se conservan o eliminan conforme a la ley." },
    ],
  },
  {
    id: "derechos",
    h: "7. Sus derechos (acceso, rectificación, cancelación, oposición)",
    body: [
      { k: "p", text: "Conforme a la Ley N.º 8968, usted tiene derecho a:" },
      { k: "ul", items: [
        "**Acceder** a los datos personales que tenemos sobre usted.",
        "**Rectificar** datos inexactos o desactualizados.",
        "**Cancelar / eliminar** sus datos cuando proceda.",
        "**Oponerse** a ciertos tratamientos.",
      ] },
      { k: "p", text: "Para ejercer estos derechos, escríbanos a **soporte@contratacr.com**. Atenderemos su solicitud en los plazos que establece la ley." },
    ],
  },
  {
    id: "seguridad",
    h: "8. Seguridad",
    body: [
      { k: "p", text: "Aplicamos medidas técnicas y organizativas razonables para proteger sus datos (por ejemplo, cifrado de contraseñas, control de acceso a la base de datos y restricción de acceso a datos sensibles). Ningún sistema es completamente infalible, pero trabajamos para proteger su información." },
    ],
  },
  {
    id: "menores",
    h: "9. Menores de edad",
    body: [
      { k: "p", text: "ContrataCR está dirigido a personas mayores de 18 años. No recolectamos intencionalmente datos de menores de edad. Si detectamos una cuenta de un menor, la eliminaremos." },
    ],
  },
  {
    id: "cambios",
    h: "10. Cambios a esta Política",
    body: [
      { k: "p", text: "Podemos actualizar esta Política. Publicaremos los cambios en la Plataforma con la fecha de actualización. Le recomendamos revisarla periódicamente." },
    ],
  },
  {
    id: "contacto",
    h: "11. Contacto",
    body: [
      { k: "p", text: "Para consultas sobre privacidad o para ejercer sus derechos, contáctenos en: **soporte@contratacr.com**" },
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <LegalDocument
      title="Política de Privacidad"
      updated="14 de junio de 2026 · Ley N.º 8968 (Costa Rica)"
      intro="En ContrataCR respetamos su privacidad y protegemos sus datos personales conforme a la **Ley N.º 8968 de Protección de la Persona frente al tratamiento de sus datos personales** y su reglamento. Esta Política explica qué datos recolectamos, para qué los usamos y cuáles son sus derechos."
      sections={SECTIONS}
      footer={
        <>
          Revisa también nuestros{" "}
          <Link href="/terminos" className="font-semibold text-[#009FD9] hover:underline">Términos y Condiciones</Link>.
        </>
      }
    />
  );
}
