import { manejarIaCv } from "@/lib/cv/ia-servidor";

// La IA del currículum (lib/cv/ia-servidor): sesión, límite diario por cuenta y validación.
export async function POST(req: Request) {
  return manejarIaCv(req, "carta");
}
