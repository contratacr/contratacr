import { Link } from "@/i18n/navigation";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

const ES_SECTIONS: LegalSection[] = [
  {
    id: "definiciones",
    h: "1. Definiciones",
    body: [
      {
        k: "ul",
        items: [
          "**ContrataCR / la Plataforma / nosotros:** el sitio web y los servicios tecnológicos disponibles en contratacr.com, que conectan a clientes con proveedores de servicios en Costa Rica.",
          "**Usuario:** toda persona que accede o utiliza la Plataforma, ya sea como Cliente o como Profesional.",
          "**Cliente:** el Usuario que busca, contacta o contrata servicios a través de la Plataforma.",
          "**Profesional / Proveedor:** el Usuario que ofrece sus servicios a través de la Plataforma.",
          "**Servicios de la Plataforma:** las herramientas tecnológicas de intermediación, búsqueda, contacto y coordinación que ContrataCR pone a disposición.",
          "**Servicios de terceros:** los trabajos, labores o servicios prestados por los Profesionales, que NO son prestados por ContrataCR.",
        ],
      },
    ],
  },
  {
    id: "intermediario",
    h: "2. Naturaleza de ContrataCR: somos un intermediario",
    body: [
      {
        k: "p",
        text: "**ContrataCR es únicamente una plataforma tecnológica de intermediación.** Nuestra función es poner en contacto a Clientes con Profesionales. ContrataCR **no presta, no ejecuta, no supervisa y no garantiza** los servicios ofrecidos por los Profesionales.",
      },
      { k: "p", text: "En consecuencia, usted reconoce y acepta que:" },
      {
        k: "ul",
        items: [
          "ContrataCR **no es parte** de ningún acuerdo, contrato o relación que se establezca entre un Cliente y un Profesional.",
          "ContrataCR **no contrata, no emplea y no representa** a los Profesionales.",
          "ContrataCR **no garantiza** la calidad, idoneidad, seguridad, legalidad, puntualidad, finalización ni resultado de ningún servicio prestado por un Profesional.",
          "ContrataCR **no interviene** en la negociación, el precio, las condiciones, la ejecución ni el pago de los servicios entre Cliente y Profesional.",
        ],
      },
    ],
  },
  {
    id: "pagos",
    h: "3. ContrataCR no procesa pagos",
    body: [
      {
        k: "p",
        text: "ContrataCR **no maneja, no procesa, no retiene ni intermedia ningún pago** entre Clientes y Profesionales. Cualquier pago, cobro, factura, depósito, anticipo o transacción económica se acuerda y realiza directamente entre el Cliente y el Profesional, fuera de la Plataforma.",
      },
      {
        k: "p",
        text: "ContrataCR no es responsable por disputas económicas, cobros indebidos, falta de pago, estafas, reembolsos o cualquier asunto financiero derivado de la relación entre Cliente y Profesional.",
      },
    ],
  },
  {
    id: "verificado",
    h: "4. La insignia Verificado",
    body: [
      {
        k: "p",
        text: "Algunos Profesionales muestran una insignia de **Verificado** en su perfil. Esta insignia confirma de forma limitada que el número de identificación proporcionado corresponde a un registro real y que el nombre asociado coincide con los registros oficiales consultados.",
      },
      {
        k: "ul",
        items: [
          "La insignia **NO garantiza ni certifica** la calidad, competencia, experiencia, idoneidad, permisos, licencias, seguros, titulaciones, resultado ni finalización de ningún trabajo.",
          "La ausencia de la insignia no implica que el Profesional sea menos confiable; simplemente significa que no completó o no aportó la verificación de identidad.",
        ],
      },
    ],
  },
  {
    id: "responsabilidad-usuarios",
    h: "5. Responsabilidad de los Usuarios",
    body: [
      { k: "sub", text: "5.1 Veracidad de la información" },
      {
        k: "p",
        text: "Cada Usuario es responsable de la veracidad, exactitud y vigencia de la información que publica. Está prohibido suplantar la identidad de terceros o usar identificaciones que no le pertenezcan.",
      },
      { k: "sub", text: "5.2 Conducta" },
      {
        k: "ul",
        items: [
          "No publicar información falsa, engañosa, difamatoria, ofensiva o ilegal.",
          "No suplantar a otra persona o entidad.",
          "No utilizar la Plataforma para fines fraudulentos o ilegales.",
          "No recolectar datos de otros Usuarios sin autorización.",
          "No interferir con el funcionamiento técnico de la Plataforma.",
        ],
      },
      { k: "sub", text: "5.3 Relación entre Cliente y Profesional" },
      {
        k: "p",
        text: "Toda contratación, coordinación, ejecución y pago de servicios ocurre directamente entre el Cliente y el Profesional, bajo su exclusiva responsabilidad.",
      },
    ],
  },
  {
    id: "limitacion",
    h: "6. Limitación de responsabilidad",
    body: [
      {
        k: "p",
        text: "En la máxima medida permitida por la legislación costarricense, ContrataCR no será responsable por daños, perjuicios, pérdidas, lesiones, incumplimientos, fraudes o conflictos derivados de la relación entre Clientes y Profesionales o de los servicios prestados por los Profesionales.",
      },
      {
        k: "note",
        text: "**Nota:** La legislación costarricense de protección al consumidor establece responsabilidades que no pueden excluirse por contrato. Esta cláusula aplica dentro de los límites permitidos por la ley.",
      },
    ],
  },
  {
    id: "moderacion",
    h: "7. Verificación, moderación y suspensión",
    body: [
      {
        k: "p",
        text: "ContrataCR puede revisar, moderar o eliminar contenido, suspender o cancelar cuentas, y atender reportes de suplantación, fraude o mala conducta. Estas decisiones buscan proteger a la comunidad, pero no convierten a ContrataCR en garante de la conducta de los Usuarios.",
      },
    ],
  },
  {
    id: "resenas",
    h: "8. Reseñas y reportes",
    body: [
      {
        k: "ul",
        items: [
          "Las reseñas solo pueden ser dejadas por Clientes que recibieron un servicio del Profesional y reflejan la opinión personal de quien las escribe.",
          "Los Usuarios pueden reportar conductas indebidas. ContrataCR revisará los reportes razonablemente, sin garantizar un resultado específico.",
        ],
      },
    ],
  },
  {
    id: "edad",
    h: "9. Requisitos de edad",
    body: [{ k: "p", text: "ContrataCR está dirigido exclusivamente a personas mayores de 18 años." }],
  },
  {
    id: "propiedad",
    h: "10. Propiedad intelectual",
    body: [
      {
        k: "p",
        text: "La marca, el logotipo, el diseño, los textos y el software de ContrataCR son propiedad de ContrataCR. El contenido que cada Usuario publica sigue siendo de su titularidad, pero otorga a ContrataCR una licencia para mostrarlo en la Plataforma con el fin de prestar el servicio.",
      },
    ],
  },
  {
    id: "datos",
    h: "11. Protección de datos",
    body: [{ k: "p", text: "El tratamiento de datos personales se rige por nuestra **Política de Privacidad**, conforme a la Ley N.º 8968 de Costa Rica." }],
  },
  {
    id: "modificaciones",
    h: "12. Modificaciones",
    body: [{ k: "p", text: "ContrataCR podrá modificar estos Términos en cualquier momento. Los cambios se publicarán en la Plataforma con su fecha de actualización." }],
  },
  {
    id: "ley",
    h: "13. Legislación aplicable y jurisdicción",
    body: [{ k: "p", text: "Estos Términos se rigen por las leyes de la República de Costa Rica. Cualquier controversia se someterá a los tribunales costarricenses competentes." }],
  },
  {
    id: "contacto",
    h: "14. Contacto",
    body: [{ k: "p", text: "Para consultas sobre estos Términos, puede contactarnos en: **soporte@contratacr.com**" }],
  },
];

const EN_SECTIONS: LegalSection[] = [
  { id: "definitions", h: "1. Definitions", body: [{ k: "ul", items: [
    "**ContrataCR / the Platform / we:** the website and technology services available at contratacr.com, which connect clients with service providers in Costa Rica.",
    "**User:** any person who accesses or uses the Platform, whether as a Client or Professional.",
    "**Client:** the User who searches for, contacts, or hires services through the Platform.",
    "**Professional / Provider:** the User who offers services through the Platform.",
    "**Platform Services:** the search, contact, coordination, and marketplace tools provided by ContrataCR.",
    "**Third-party services:** the work or services performed by Professionals, which are not performed by ContrataCR.",
  ] }] },
  { id: "intermediary", h: "2. ContrataCR is an intermediary", body: [
    { k: "p", text: "**ContrataCR is only a technology intermediation platform.** Our role is to connect Clients with Professionals. ContrataCR **does not provide, perform, supervise, or guarantee** the services offered by Professionals." },
    { k: "p", text: "You acknowledge and agree that:" },
    { k: "ul", items: [
      "ContrataCR is not a party to any agreement, contract, or relationship between a Client and a Professional.",
      "ContrataCR does not hire, employ, or represent Professionals.",
      "ContrataCR does not guarantee the quality, suitability, safety, legality, punctuality, completion, or result of any service performed by a Professional.",
      "ContrataCR does not intervene in negotiation, price, terms, performance, or payment between Clients and Professionals.",
    ] },
  ] },
  { id: "payments", h: "3. ContrataCR does not process payments", body: [
    { k: "p", text: "ContrataCR **does not handle, process, hold, or intermediate any payment** between Clients and Professionals. Any payment, invoice, deposit, advance, or financial transaction is agreed and made directly between the Client and the Professional, outside the Platform." },
    { k: "p", text: "ContrataCR is not responsible for payment disputes, improper charges, non-payment, scams, refunds, or any financial matter arising from the relationship between Client and Professional." },
  ] },
  { id: "verified", h: "4. The Verified badge", body: [
    { k: "p", text: "Some Professionals display a **Verified** badge on their profile. This badge has a limited meaning: it confirms that the identification number provided corresponds to a real record and that the associated name matches the official records consulted." },
    { k: "ul", items: [
      "The badge **does not guarantee or certify** quality, competence, experience, suitability, licenses, permits, insurance, qualifications, job outcome, or job completion.",
      "The absence of the badge does not mean the Professional is less trustworthy; it only means they did not complete or provide identity verification.",
    ] },
  ] },
  { id: "user-responsibility", h: "5. User responsibility", body: [
    { k: "sub", text: "5.1 Accuracy of information" },
    { k: "p", text: "Each User is responsible for the truthfulness, accuracy, and current validity of the information they publish. Impersonation and use of identification that does not belong to the User are prohibited." },
    { k: "sub", text: "5.2 Conduct" },
    { k: "ul", items: [
      "Do not publish false, misleading, defamatory, offensive, or illegal information.",
      "Do not impersonate another person or entity.",
      "Do not use the Platform for fraudulent or illegal purposes.",
      "Do not collect data from other Users without authorization.",
      "Do not interfere with the technical operation of the Platform.",
    ] },
    { k: "sub", text: "5.3 Relationship between Client and Professional" },
    { k: "p", text: "All hiring, coordination, performance, and payment of services occurs directly between the Client and the Professional, under their exclusive responsibility." },
  ] },
  { id: "limitation", h: "6. Limitation of liability", body: [
    { k: "p", text: "To the fullest extent permitted by Costa Rican law, ContrataCR will not be liable for damages, losses, injuries, breaches, fraud, or conflicts arising from the relationship between Clients and Professionals or from services performed by Professionals." },
    { k: "note", text: "**Note:** Costa Rican consumer protection law may establish responsibilities that cannot be excluded by contract. This clause applies within the limits allowed by law." },
  ] },
  { id: "moderation", h: "7. Verification, moderation, and suspension", body: [
    { k: "p", text: "ContrataCR may review, moderate, or remove content, suspend or cancel accounts, and handle reports of impersonation, fraud, or misconduct. These decisions are intended to protect the community, but they do not make ContrataCR a guarantor of User conduct." },
  ] },
  { id: "reviews", h: "8. Reviews and reports", body: [{ k: "ul", items: [
    "Reviews may only be left by Clients who received a service from the Professional and reflect the personal opinion of the reviewer.",
    "Users may report misconduct through the Platform. ContrataCR will review reports reasonably, without guaranteeing a specific result.",
  ] }] },
  { id: "age", h: "9. Age requirement", body: [{ k: "p", text: "ContrataCR is intended only for people over 18 years old." }] },
  { id: "intellectual-property", h: "10. Intellectual property", body: [{ k: "p", text: "The ContrataCR brand, logo, design, text, and software belong to ContrataCR and are protected by law. Content published by each User remains theirs, but the User grants ContrataCR a license to display it on the Platform to provide the service." }] },
  { id: "data", h: "11. Data protection", body: [{ k: "p", text: "Personal data processing is governed by our **Privacy Policy**, under Costa Rican Law No. 8968." }] },
  { id: "changes", h: "12. Changes", body: [{ k: "p", text: "ContrataCR may modify these Terms at any time. Changes will be published on the Platform with their update date." }] },
  { id: "law", h: "13. Governing law and jurisdiction", body: [{ k: "p", text: "These Terms are governed by the laws of the Republic of Costa Rica. Any dispute will be submitted to the competent Costa Rican courts." }] },
  { id: "contact", h: "14. Contact", body: [{ k: "p", text: "For questions about these Terms, contact us at: **soporte@contratacr.com**" }] },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en"
    ? {
        title: "Terms and Conditions — ContrataCR",
        description: "ContrataCR Terms and Conditions of Use, a technology platform connecting clients with professionals in Costa Rica.",
      }
    : {
        title: "Términos y condiciones — ContrataCR",
        description: "Términos y Condiciones de Uso de ContrataCR, plataforma de intermediación que conecta clientes con profesionales en Costa Rica.",
      };
}

export default async function TerminosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return (
    <LegalDocument
      title={en ? "Terms and Conditions of Use" : "Términos y Condiciones de Uso"}
      updated={en ? "June 14, 2026" : "14 de junio de 2026"}
      intro={en
        ? "Welcome to ContrataCR. By accessing and using our platform, you accept these Terms and Conditions in full. Please read them carefully before using the service. If you do not agree, you should not use ContrataCR."
        : "Bienvenido a ContrataCR. Al acceder y utilizar nuestra plataforma, usted acepta estos Términos y Condiciones en su totalidad. Le pedimos leerlos con atención antes de usar el servicio. Si no está de acuerdo con ellos, no debe utilizar ContrataCR."}
      sections={en ? EN_SECTIONS : ES_SECTIONS}
      footer={en ? (
        <>
          Also review our{" "}
          <Link href="/privacidad" className="font-semibold text-[#009FD9] hover:underline">Privacy Policy</Link>.
        </>
      ) : (
        <>
          Revisa también nuestra{" "}
          <Link href="/privacidad" className="font-semibold text-[#009FD9] hover:underline">Política de Privacidad</Link>.
        </>
      )}
    />
  );
}
