import { NextRequest, NextResponse } from "next/server";

const DIGITAL_API_URL = "https://api.digital.go.cr/v1/en/registry";
const CLIENT_ID = process.env.CR_DIGITAL_API_CLIENT_ID;
const CLIENT_SECRET = process.env.CR_DIGITAL_API_CLIENT_SECRET;

// v1 API response shape
type DigitalApiV1Response = {
  name?: string;
  firstname?: string;
  surname?: string;
  // Fallback: old shape from legacy endpoint
  nombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
};

function buildFullName(data: DigitalApiV1Response): string {
  // Handle v1 response shape
  if (data.name || data.firstname || data.surname) {
    return [data.name, data.firstname, data.surname]
      .filter(Boolean)
      .join(" ");
  }
  // Fallback: legacy shape
  return [data.nombre, data.primerApellido, data.segundoApellido]
    .filter(Boolean)
    .map((s) => (s as string).charAt(0) + (s as string).slice(1).toLowerCase())
    .join(" ");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cedula = id.replace(/\D/g, "");

  if (!cedula || cedula.length < 9 || cedula.length > 12) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  if (CLIENT_ID && CLIENT_SECRET) {
    try {
      const res = await fetch(`${DIGITAL_API_URL}/${cedula}`, {
        headers: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        },
        next: { revalidate: 3600 },
      });

      if (!res.ok) {
        if (res.status === 404) {
          return NextResponse.json({ error: "ID not found" }, { status: 404 });
        }
        throw new Error(`Upstream error ${res.status}`);
      }

      const data: DigitalApiV1Response = await res.json();
      return NextResponse.json({ fullName: buildFullName(data) });
    } catch (err) {
      console.error("[cedula API] Upstream failed:", err);
      return NextResponse.json({ error: "Lookup service unavailable" }, { status: 503 });
    }
  }

  // Development fallback — mock response when API keys are not configured
  const mockNames: Record<string, string> = {
    "101234567": "Mario Alberto Vargas Solano",
    "102345678": "Ana Gabriela Rodríguez Mora",
    "103456789": "Carlos Andrés Jiménez Ulate",
    "104567890": "Sofía Marcela Brenes Quesada",
  };

  const fullName = mockNames[cedula] ?? "Juan Carlos Pérez González";
  return NextResponse.json({ fullName, _mock: true });
}
