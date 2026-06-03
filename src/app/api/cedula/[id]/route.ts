import { NextRequest, NextResponse } from "next/server";

const DIGITAL_API_URL = "https://api.digital.go.cr/v1/en/registry";
const TSE_API_URL = "https://servicioselectorales.tse.go.cr/chc/consulta_cedula.aspx";
const CLIENT_ID = process.env.CR_DIGITAL_API_CLIENT_ID;
const CLIENT_SECRET = process.env.CR_DIGITAL_API_CLIENT_SECRET;

type DigitalApiV1Response = {
  name?: string;
  firstname?: string;
  surname?: string;
  nombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
};

function buildFullName(data: DigitalApiV1Response): string {
  if (data.name || data.firstname || data.surname) {
    return [data.name, data.firstname, data.surname].filter(Boolean).join(" ");
  }
  return [data.nombre, data.primerApellido, data.segundoApellido]
    .filter(Boolean)
    .map((s) => (s as string).charAt(0).toUpperCase() + (s as string).slice(1).toLowerCase())
    .join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function isValidFormat(cedula: string): boolean {
  // CR physical ID: 9 digits, first digit 1-9
  if (/^[1-9]\d{8}$/.test(cedula)) return true;
  // DIMEX: 11-12 digits
  if (/^\d{11,12}$/.test(cedula)) return true;
  // NITE: 10 digits
  if (/^\d{10}$/.test(cedula)) return true;
  return false;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cedula = id.replace(/\D/g, "");

  if (!cedula) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  }

  if (!isValidFormat(cedula)) {
    return NextResponse.json(
      {
        error:
          "Formato inválido. Cédula CR: 9 dígitos (inicia en 1-9). DIMEX: 11-12 dígitos. NITE: 10 dígitos.",
      },
      { status: 400 }
    );
  }

  // Layer 1: Ministerio Digital API (official)
  if (CLIENT_ID && CLIENT_SECRET) {
    try {
      const res = await fetch(`${DIGITAL_API_URL}/${cedula}`, {
        headers: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const data: DigitalApiV1Response = await res.json();
        return NextResponse.json({ fullName: buildFullName(data), source: "digital" });
      }
      if (res.status === 404) {
        return NextResponse.json({ error: "Cédula no encontrada" }, { status: 404 });
      }
      // Non-404 error: fall through to Layer 2
    } catch (err) {
      console.error("[cedula] Layer 1 failed:", err);
    }
  }

  // Layer 2: TSE fallback (HTML scraping, 4s timeout)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const tseRes = await fetch(`${TSE_API_URL}?cedula=${cedula}`, {
      signal: controller.signal,
      headers: { "User-Agent": "ContrataCR/1.0" },
    });
    clearTimeout(timeoutId);
    if (tseRes.ok) {
      const html = await tseRes.text();
      const nombre = html.match(/id="lblnombre"[^>]*>\s*([^<]+?)\s*</)?.[ 1];
      const ap1 = html.match(/id="lblapellido1"[^>]*>\s*([^<]+?)\s*</)?.[ 1];
      const ap2 = html.match(/id="lblapellido2"[^>]*>\s*([^<]+?)\s*</)?.[ 1];
      if (nombre) {
        const fullName = [nombre, ap1, ap2]
          .filter(Boolean)
          .map((p) => capitalize(p!))
          .join(" ");
        return NextResponse.json({ fullName, source: "tse" });
      }
    }
  } catch (err) {
    console.error("[cedula] Layer 2 (TSE) failed:", err);
  }

  // Layer 3: Development mock
  if (process.env.NODE_ENV !== "production") {
    const mockNames: Record<string, string> = {
      "101234567": "Mario Alberto Vargas Solano",
      "102345678": "Ana Gabriela Rodriguez Mora",
      "103456789": "Carlos Andres Jimenez Ulate",
      "104567890": "Sofia Marcela Brenes Quesada",
    };
    const fullName = mockNames[cedula] ?? "Juan Carlos Perez Gonzalez";
    return NextResponse.json({ fullName, source: "mock" });
  }

  return NextResponse.json(
    { error: "Servicio no disponible temporalmente. Podés ingresar tu nombre manualmente." },
    { status: 503 }
  );
}
