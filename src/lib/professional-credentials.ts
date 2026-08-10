export type ProfessionalCredentialSuggestion = { label: string; issuer: string };

type LocalizedCredential = { labelEs: string; labelEn: string; issuerEs: string; issuerEn: string };

function credential(labelEs: string, labelEn: string, issuerEs: string, issuerEn = issuerEs): LocalizedCredential {
  return { labelEs, labelEn, issuerEs, issuerEn };
}

const CREDENTIALS_BY_SERVICE: Record<string, LocalizedCredential> = {
  ingenieria_civil: credential("Número de colegiado", "Membership number", "CFIA"),
  ingenieria_electrica: credential("Número de colegiado", "Membership number", "CFIA"),
  ingenieria_mecanica: credential("Número de colegiado", "Membership number", "CFIA"),
  arquitectura: credential("Número de colegiado", "Membership number", "CFIA"),
  topografia: credential("Número de colegiado", "Membership number", "CFIA"),
  legal: credential("Número de colegiado", "Bar membership number", "Colegio de Abogados y Abogadas de Costa Rica", "Costa Rican Bar Association"),
  notaria: credential("Código de notario", "Notary code", "Dirección Nacional de Notariado", "National Notary Directorate"),
  contabilidad: credential("Número de colegiado", "Membership number", "Colegio profesional", "Professional association"),
  auditoria: credential("Número de colegiado", "Membership number", "Colegio profesional", "Professional association"),
  corredor_seguros: credential("Número de licencia", "License number", "SUGESE"),
  guia_turistico: credential("Número de credencial", "Credential number", "Instituto Costarricense de Turismo", "Costa Rican Tourism Institute"),
};

const HEALTH_SERVICES = new Set([
  "nutricion", "psicologia", "psiquiatria", "fisioterapia", "odontologia", "ortodoncia",
  "pediatria", "optometria", "enfermeria", "medicina_domicilio", "medico_especialista",
  "laboratorio_clinico", "terapia_lenguaje", "terapia_ocupacional", "veterinaria",
]);

export function professionalCredentialSuggestion(serviceId: string, locale: string): ProfessionalCredentialSuggestion | null {
  const configured = CREDENTIALS_BY_SERVICE[serviceId] ?? (HEALTH_SERVICES.has(serviceId)
    ? credential("Código profesional", "Professional code", "Colegio profesional", "Professional association")
    : null);
  if (!configured) return null;
  return locale === "en"
    ? { label: configured.labelEn, issuer: configured.issuerEn }
    : { label: configured.labelEs, issuer: configured.issuerEs };
}

export function serviceSupportsProfessionalCredential(serviceId: string) {
  return Boolean(CREDENTIALS_BY_SERVICE[serviceId] || HEALTH_SERVICES.has(serviceId));
}
