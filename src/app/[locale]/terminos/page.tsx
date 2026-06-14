import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

export const metadata = {
  title: "Términos y condiciones — ContrataCR",
  description: "Términos y Condiciones de Uso de ContrataCR, plataforma de intermediación que conecta clientes con profesionales en Costa Rica.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "definiciones",
    h: "1. Definiciones",
    body: [
      { k: "ul", items: [
        "**ContrataCR / la Plataforma / nosotros:** el sitio web y los servicios tecnológicos disponibles en contratacr.com, que conectan a clientes con proveedores de servicios en Costa Rica.",
        "**Usuario:** toda persona que accede o utiliza la Plataforma, ya sea como Cliente o como Profesional.",
        "**Cliente:** el Usuario que busca, contacta o contrata servicios a través de la Plataforma.",
        "**Profesional / Proveedor:** el Usuario que ofrece sus servicios a través de la Plataforma.",
        "**Servicios de la Plataforma:** las herramientas tecnológicas de intermediación, búsqueda, contacto y coordinación que ContrataCR pone a disposición.",
        "**Servicios de terceros:** los trabajos, labores o servicios prestados por los Profesionales, que NO son prestados por ContrataCR.",
      ] },
    ],
  },
  {
    id: "intermediario",
    h: "2. Naturaleza de ContrataCR: somos un intermediario",
    body: [
      { k: "p", text: "**ContrataCR es únicamente una plataforma tecnológica de intermediación.** Nuestra función es poner en contacto a Clientes con Profesionales. ContrataCR **no presta, no ejecuta, no supervisa y no garantiza** los servicios ofrecidos por los Profesionales." },
      { k: "p", text: "En consecuencia, usted reconoce y acepta que:" },
      { k: "ul", items: [
        "ContrataCR **no es parte** de ningún acuerdo, contrato o relación que se establezca entre un Cliente y un Profesional. Dicha relación es directa y exclusiva entre ellos.",
        "ContrataCR **no contrata, no emplea y no representa** a los Profesionales. Los Profesionales son terceros independientes que utilizan la Plataforma por su cuenta y riesgo.",
        "ContrataCR **no garantiza** la calidad, idoneidad, seguridad, legalidad, puntualidad, finalización ni resultado de ningún servicio prestado por un Profesional.",
        "ContrataCR **no interviene** en la negociación, el precio, las condiciones, la ejecución ni el pago de los servicios entre Cliente y Profesional.",
      ] },
    ],
  },
  {
    id: "pagos",
    h: "3. ContrataCR no procesa pagos",
    body: [
      { k: "p", text: "ContrataCR **no maneja, no procesa, no retiene ni intermedia ningún pago** entre Clientes y Profesionales. Cualquier pago, cobro, factura, depósito, anticipo o transacción económica se acuerda y realiza **directa y exclusivamente entre el Cliente y el Profesional, fuera de la Plataforma**, bajo su propia responsabilidad." },
      { k: "p", text: "ContrataCR no es responsable por disputas económicas, cobros indebidos, falta de pago, estafas, reembolsos o cualquier asunto financiero derivado de la relación entre Cliente y Profesional." },
    ],
  },
  {
    id: "verificado",
    h: "4. La insignia “Verificado” (verificación de identidad)",
    body: [
      { k: "p", text: "Algunos Profesionales muestran una insignia de **“Verificado”** en su perfil. Esta insignia tiene un significado **limitado y específico**, que usted acepta y comprende:" },
      { k: "ul", items: [
        "La insignia **únicamente** confirma que el número de cédula proporcionado corresponde a un registro real y que el nombre asociado coincide con los registros oficiales consultados.",
        "La insignia **NO garantiza ni certifica**: (i) la calidad, competencia, experiencia o idoneidad del Profesional; (ii) el resultado, la finalización o la satisfacción de ningún trabajo; (iii) que el Profesional cuente con permisos, licencias, seguros o titulaciones; ni (iv) por sí sola, que la persona que se registró sea físicamente el titular de la cédula.",
        "La ausencia de la insignia no implica que el Profesional sea menos confiable; simplemente significa que no completó o no aportó la verificación de identidad.",
      ] },
      { k: "p", text: "La verificación de identidad es una herramienta de referencia para los Clientes, **no una garantía** de ContrataCR sobre el Profesional ni sobre sus servicios. El significado de la insignia se explica también en la sección de la Plataforma destinada a ello." },
    ],
  },
  {
    id: "responsabilidad-usuarios",
    h: "5. Responsabilidad de los Usuarios",
    body: [
      { k: "sub", text: "5.1 Veracidad de la información" },
      { k: "p", text: "Cada Usuario es el único responsable de la veracidad, exactitud y vigencia de la información que publica (datos personales, profesión, servicios, certificaciones, precios, ubicación, fotografías, etc.). Está prohibido suplantar la identidad de terceros o usar cédulas que no le pertenezcan." },
      { k: "sub", text: "5.2 Conducta" },
      { k: "p", text: "Los Usuarios se comprometen a usar la Plataforma de forma lícita, respetuosa y de buena fe, y a no:" },
      { k: "ul", items: [
        "Publicar información falsa, engañosa, difamatoria, ofensiva o ilegal.",
        "Suplantar a otra persona o entidad.",
        "Utilizar la Plataforma para fines fraudulentos o ilegales.",
        "Recolectar datos de otros Usuarios sin autorización.",
        "Interferir con el funcionamiento técnico de la Plataforma.",
      ] },
      { k: "sub", text: "5.3 Relación entre Cliente y Profesional" },
      { k: "p", text: "Toda contratación, coordinación, ejecución y pago de servicios ocurre **directamente entre el Cliente y el Profesional**, bajo su exclusiva responsabilidad. Los Usuarios son responsables de evaluar, por su propia cuenta, con quién deciden contratar o trabajar, y de tomar las precauciones razonables." },
    ],
  },
  {
    id: "limitacion",
    h: "6. Limitación de responsabilidad de ContrataCR",
    body: [
      { k: "p", text: "En la máxima medida permitida por la legislación costarricense, usted acepta que:" },
      { k: "ul", items: [
        "ContrataCR **no será responsable** por los daños, perjuicios, pérdidas, lesiones, incumplimientos, fraudes o conflictos que surjan de la relación entre Clientes y Profesionales o de los servicios prestados por los Profesionales.",
        "ContrataCR **no será responsable** por la conducta, las acciones u omisiones de ningún Usuario, dentro o fuera de la Plataforma.",
        "ContrataCR proporciona la Plataforma “tal cual” y “según disponibilidad”, sin garantías de funcionamiento ininterrumpido o libre de errores.",
        "ContrataCR **no será responsable** por información inexacta publicada por los Usuarios.",
      ] },
      { k: "p", text: "ContrataCR sí se compromete a actuar de buena fe en la operación de la Plataforma y a atender los reportes y reclamos de los Usuarios a través de sus canales de soporte." },
      { k: "note", text: "**Nota:** La legislación costarricense de protección al consumidor (Ley N.º 7472) establece ciertas responsabilidades que no pueden excluirse por contrato. Esta cláusula se aplica dentro de los límites que la ley permite." },
    ],
  },
  {
    id: "moderacion",
    h: "7. Verificación, moderación y suspensión",
    body: [
      { k: "p", text: "ContrataCR se reserva el derecho, sin que ello constituya una obligación ni una garantía, de:" },
      { k: "ul", items: [
        "Revisar, moderar o eliminar contenido que infrinja estos Términos.",
        "Suspender o cancelar cuentas que incumplan estos Términos o la ley.",
        "Atender reportes de suplantación, fraude o mala conducta a través de sus canales.",
      ] },
      { k: "p", text: "Las decisiones de moderación buscan proteger a la comunidad, pero no convierten a ContrataCR en garante de la conducta de los Usuarios." },
    ],
  },
  {
    id: "resenas",
    h: "8. Reseñas y reportes",
    body: [
      { k: "ul", items: [
        "Las reseñas solo pueden ser dejadas por Clientes que recibieron un servicio del Profesional, y reflejan la opinión personal de quien las escribe, no la de ContrataCR.",
        "Los Usuarios pueden reportar conductas indebidas a través de los canales de la Plataforma. ContrataCR revisará los reportes razonablemente, sin garantizar un resultado específico.",
      ] },
    ],
  },
  {
    id: "edad",
    h: "9. Requisitos de edad",
    body: [
      { k: "p", text: "ContrataCR está dirigido exclusivamente a personas **mayores de 18 años**. Al usar la Plataforma, usted declara ser mayor de edad y tener capacidad legal para contratar conforme a la legislación costarricense. No está permitido el registro ni el uso por parte de menores de edad." },
    ],
  },
  {
    id: "propiedad",
    h: "10. Propiedad intelectual",
    body: [
      { k: "p", text: "La marca, el logotipo, el diseño, los textos y el software de ContrataCR son propiedad de ContrataCR y están protegidos por la ley. El contenido que cada Usuario publica sigue siendo de su titularidad, pero el Usuario otorga a ContrataCR una licencia para mostrarlo en la Plataforma con el fin de prestar el servicio." },
    ],
  },
  {
    id: "datos",
    h: "11. Protección de datos",
    body: [
      { k: "p", text: "El tratamiento de los datos personales se rige por nuestra **Política de Privacidad**, conforme a la Ley N.º 8968 de Protección de la Persona frente al tratamiento de sus datos personales y su reglamento." },
    ],
  },
  {
    id: "modificaciones",
    h: "12. Modificaciones",
    body: [
      { k: "p", text: "ContrataCR podrá modificar estos Términos en cualquier momento. Los cambios se publicarán en la Plataforma con su fecha de actualización. El uso continuado de la Plataforma después de una modificación implica la aceptación de los nuevos Términos." },
    ],
  },
  {
    id: "ley",
    h: "13. Legislación aplicable y jurisdicción",
    body: [
      { k: "p", text: "Estos Términos se rigen por las leyes de la República de Costa Rica. Cualquier controversia se someterá a los tribunales costarricenses competentes." },
    ],
  },
  {
    id: "contacto",
    h: "14. Contacto",
    body: [
      { k: "p", text: "Para consultas sobre estos Términos, puede contactarnos en: **soporte@contratacr.com**" },
    ],
  },
];

export default function TerminosPage() {
  return (
    <LegalDocument
      title="Términos y Condiciones de Uso"
      updated="14 de junio de 2026"
      intro="Bienvenido a ContrataCR. Al acceder y utilizar nuestra plataforma, usted acepta estos Términos y Condiciones en su totalidad. Le pedimos leerlos con atención antes de usar el servicio. Si no está de acuerdo con ellos, no debe utilizar ContrataCR."
      sections={SECTIONS}
      footer={
        <>
          ¿Dudas sobre estos Términos? Escríbenos a{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#009FD9] hover:underline">{SUPPORT_EMAIL}</a>{" "}
          o desde <Link href="/soporte" className="font-semibold text-[#009FD9] hover:underline">Contactar soporte</Link>. Revisa también nuestra{" "}
          <Link href="/privacidad" className="font-semibold text-[#009FD9] hover:underline">Política de Privacidad</Link>.
        </>
      }
    />
  );
}
