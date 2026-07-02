// Insurance networks (aseguradoras) operating in Costa Rica. Professionals select
// which networks they belong to; clients filter by them in /buscar.
export type Insurer = { id: string; label: string };

export const INSURERS: Insurer[] = [
  { id: "adisa", label: "ADISA" },
  { id: "allianz", label: "Allianz" },
  { id: "american_fidelity", label: "American Fidelity" },
  { id: "assa", label: "ASSA" },
  { id: "best_doctors", label: "Best Doctors" },
  { id: "triple_s", label: "BlueCross BlueShield" },
  { id: "bmi", label: "BMI" },
  { id: "cigna", label: "Cigna" },
  { id: "davivienda", label: "Davivienda Seguros" },
  { id: "e_dental", label: "e-Dental" },
  { id: "ebs", label: "EBS" },
  { id: "identalcare", label: "IdentalCare" },
  { id: "ins", label: "INS Medical" },
  { id: "lafise", label: "Seguros Lafise" },
  { id: "manhattan_life", label: "Manhattan Life" },
  { id: "mapfre", label: "MAPFRE" },
  { id: "medismart", label: "Medismart" },
  { id: "metlife", label: "MetLife" },
  { id: "oceanica", label: "Oceánica de Seguros" },
  { id: "orbe_vida", label: "Orbe Vida" },
  { id: "panamerican", label: "Pan-American Life - PALIG" },
  { id: "qualitas", label: "Quálitas" },
  { id: "redbridge", label: "Redbridge" },
  { id: "sagicor", label: "Sagicor" },
  { id: "salud_360", label: "Salud 360" },
  { id: "salud_primero", label: "Salud Primero" },
  { id: "sm_seguros", label: "SM Seguros" },
  { id: "vital_care_adisa", label: "Vital Care - Adisa" },
];

const BY_ID = new Map(INSURERS.map((i) => [i.id, i]));

export function insurerLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}
