// Insurance networks (aseguradoras) operating in Costa Rica. Professionals select
// which networks they belong to; clients filter by them in /buscar.
export type Insurer = { id: string; label: string };

export const INSURERS: Insurer[] = [
  { id: "ins", label: "INS (Instituto Nacional de Seguros)" },
  { id: "assa", label: "ASSA" },
  { id: "sagicor", label: "Sagicor" },
  { id: "mapfre", label: "MAPFRE" },
  { id: "bmi", label: "BMI / ADISA" },
  { id: "panamerican", label: "Pan-American Life (PALIG)" },
  { id: "oceanica", label: "Oceánica de Seguros" },
  { id: "davivienda", label: "Davivienda Seguros" },
  { id: "lafise", label: "Seguros Lafise" },
  { id: "qualitas", label: "Qualitas" },
  { id: "triple_s", label: "Triple-S (Blue Cross)" },
  { id: "cigna", label: "Cigna" },
];

const BY_ID = new Map(INSURERS.map((i) => [i.id, i]));

export function insurerLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}
