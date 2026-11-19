import {z} from 'zod';

/**
 * Round 6A: provider registry of the integration framework. Pure data (safe in the browser): which
 * providers exist, what each one is for, which SERVER environment variables each mode needs (names
 * only — values never leave the server) and which non-secret config keys may be stored.
 *
 * Modes: «mock» = deterministic local adapter (default, no network); «sandbox» = provider's test
 * environment, active only when every sandbox env var exists; «production» = never automatic: an
 * explicit owner action AND PRO_INTEGRATIONS_ALLOW_PRODUCTION=1 on the server.
 */
export const integrationProviders=['hacienda','tilopay','esign','google','microsoft','quickbooks','ai','transcription','marketing_email','meta_ads','google_ads','product_clipper','site_domain'] as const;
export type IntegrationProvider=typeof integrationProviders[number];
export const integrationModes=['mock','sandbox','production'] as const;
export type IntegrationMode=typeof integrationModes[number];
export const PRODUCTION_FLAG='PRO_INTEGRATIONS_ALLOW_PRODUCTION';
export const PRODUCTION_CONFIRMATION='ACTIVAR PRODUCCION';
type Copy={es:string;en:string};
export type ProviderDescriptor={
 id:IntegrationProvider;kind:'einvoice'|'payments'|'esign'|'workspace'|'accounting'|'ai'|'transcription'|'marketing_email'|'ads'|'clipper'|'domain';name:Copy;purpose:Copy;
 env:{sandbox:string[];production:string[];optional:string[]};
 docs:string[];
 /** Non-secret configuration this provider accepts (validated again in SQL). */
 config:z.ZodType<Record<string,unknown>>;
};
const haciendaConfig=z.object({
 /** Receive Hacienda's asynchronous answer at our callback (sandbox/production only). */
 callbackEnabled:z.boolean().default(false),
 /** Ask for the state again after this many seconds (5–600). */
 pollSeconds:z.number().int().min(5).max(600).default(30),
}).strict();
const tilopayConfig=z.object({
 cardEnabled:z.boolean().default(true),
 sinpeEnabled:z.boolean().default(true),
 /** Phone shown to the payer for SINPE Móvil (8 digits, Costa Rica). Not secret: it is public on the page. */
 sinpePhone:z.union([z.literal(''),z.string().regex(/^[2-8]\d{7}$/)]).default(''),
 linkDays:z.number().int().min(1).max(60).default(7),
}).strict();
/** Round 6B: electronic signature (mock provider; DocuSign eSignature adapter for the provider sandbox). */
const esignConfig=z.object({
 expiryDays:z.number().int().min(1).max(60).default(14),
 /** Days between automatic reminders the provider sends (0 = none). Only real providers use it. */
 reminderDays:z.number().int().min(0).max(30).default(3),
}).strict();
/** Round 6B: Google Workspace / Microsoft 365 connectors (mail, calendar, files). Which parts are used. */
const workspaceConfig=z.object({mail:z.boolean().default(true),calendar:z.boolean().default(true),files:z.boolean().default(true)}).strict();
const quickbooksConfig=z.object({
 /** «emitted» = only invoices accepted by Hacienda; «all» = also internal drafts. Mirrors the mapping screen. */
 invoiceScope:z.enum(['emitted','all']).default('emitted'),
}).strict();
/**
 * Round 6C: AI assistant (Anthropic Claude, Messages API) and audio transcription (OpenAI-compatible
 * /v1/audio/transcriptions). Only the model name is configurable here; the monthly usage cap and the
 * data-processing consent live in pro_ai_settings (per company, consent OFF by default).
 */
export const AI_DEFAULT_MODEL='claude-sonnet-5-5';
export const TRANSCRIPTION_DEFAULT_MODEL='whisper-1';
const aiConfig=z.object({model:z.string().regex(/^claude-[a-z0-9-]{3,60}$/).default(AI_DEFAULT_MODEL)}).strict();
const transcriptionConfig=z.object({model:z.string().regex(/^[a-z0-9][a-z0-9._-]{1,60}$/).default(TRANSCRIPTION_DEFAULT_MODEL),language:z.enum(['auto','es','en']).default('auto')}).strict();
/**
 * Round 6D: tools for professionals' own marketing. Email campaigns (Brevo transactional API adapter), cost import
 * from Meta / Google Ads (documented stubs), the public product-page reader of the catalog clipper and the custom
 * domain of the professional website (Cloudflare for SaaS). All mock by default; none is active without its keys.
 */
const marketingEmailConfig=z.object({
 /** Sender shown to recipients; the domain must be verified at the provider before going live. Not secret. */
 senderName:z.string().max(80).default(''),senderEmail:z.union([z.literal(''),z.string().email().max(254)]).default(''),
 /** Hard cap of messages per campaign (protects the sender reputation and the provider quota). */
 maxPerCampaign:z.number().int().min(1).max(2000).default(500),
}).strict();
const adsConfig=z.object({
 /** Ad account id (not secret): Meta «act_…» or Google Ads customer id «123-456-7890». Only used by the cost import. */
 accountId:z.union([z.literal(''),z.string().regex(/^(act_\d{5,20}|\d{3}-\d{3}-\d{4})$/)]).default(''),
}).strict();
const clipperConfig=z.object({
 /** Only public pages; robots.txt is always respected (not configurable). */
 timeoutSeconds:z.number().int().min(3).max(15).default(8),
}).strict();
const domainConfig=z.object({
 /** CNAME target customers point their domain to (e.g. sitios.contratacr.com). Not secret. */
 cnameTarget:z.union([z.literal(''),z.string().regex(/^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/)]).default(''),
}).strict();
export const OAUTH_TOKEN_KEY_ENV='PRO_OAUTH_TOKEN_KEY';
export const providerRegistry:Record<IntegrationProvider,ProviderDescriptor>={
 hacienda:{
  id:'hacienda',kind:'einvoice',
  name:{es:'Hacienda · Comprobantes electrónicos (ATV)',en:'Hacienda · Electronic invoices (ATV)'},
  purpose:{es:'Emitir Factura Electrónica, Tiquete y Nota de crédito v4.4 desde sus borradores.',en:'Issue v4.4 electronic invoices, tickets and credit notes from your drafts.'},
  env:{
   sandbox:['PRO_HACIENDA_SANDBOX_USERNAME','PRO_HACIENDA_SANDBOX_PASSWORD','PRO_HACIENDA_SANDBOX_P12_PATH','PRO_HACIENDA_SANDBOX_P12_PIN'],
   production:['PRO_HACIENDA_PROD_USERNAME','PRO_HACIENDA_PROD_PASSWORD','PRO_HACIENDA_PROD_P12_PATH','PRO_HACIENDA_PROD_P12_PIN'],
   optional:['PRO_HACIENDA_SANDBOX_TOKEN_URL','PRO_HACIENDA_SANDBOX_CLIENT_ID','PRO_HACIENDA_SANDBOX_API_URL'],
  },
  docs:['https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf','https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html'],
  config:haciendaConfig,
 },
 tilopay:{
  id:'tilopay',kind:'payments',
  name:{es:'Tilopay · Tarjetas y SINPE Móvil',en:'Tilopay · Cards and SINPE Móvil'},
  purpose:{es:'Cobrar facturas y cuotas con un enlace de pago (tarjeta o SINPE Móvil).',en:'Collect invoices and installments with a payment link (card or SINPE Móvil).'},
  env:{
   sandbox:['PRO_TILOPAY_SANDBOX_API_USER','PRO_TILOPAY_SANDBOX_API_PASSWORD','PRO_TILOPAY_SANDBOX_API_KEY'],
   production:['PRO_TILOPAY_PROD_API_USER','PRO_TILOPAY_PROD_API_PASSWORD','PRO_TILOPAY_PROD_API_KEY'],
   optional:['PRO_TILOPAY_API_URL'],
  },
  docs:['https://tilopay.com/developers/openapi.json','https://tilopay.com/en/developers/api/webhooks'],
  config:tilopayConfig,
 },
 esign:{
  id:'esign',kind:'esign',
  name:{es:'Firma electrónica · DocuSign (pruebas) o simulación',en:'Electronic signature · DocuSign (sandbox) or simulation'},
  purpose:{es:'Pedir la firma de contratos, cotizaciones y órdenes de cambio; guarda el PDF firmado y el certificado de auditoría.',en:'Request signatures on contracts, quotes and change orders; stores the signed PDF and the audit certificate.'},
  env:{
   sandbox:['PRO_DOCUSIGN_SANDBOX_INTEGRATION_KEY','PRO_DOCUSIGN_SANDBOX_USER_ID','PRO_DOCUSIGN_SANDBOX_ACCOUNT_ID','PRO_DOCUSIGN_SANDBOX_PRIVATE_KEY_PATH','PRO_DOCUSIGN_SANDBOX_CONNECT_HMAC'],
   production:['PRO_DOCUSIGN_PROD_INTEGRATION_KEY','PRO_DOCUSIGN_PROD_USER_ID','PRO_DOCUSIGN_PROD_ACCOUNT_ID','PRO_DOCUSIGN_PROD_PRIVATE_KEY_PATH','PRO_DOCUSIGN_PROD_CONNECT_HMAC','PRO_DOCUSIGN_PROD_BASE_URL'],
   optional:['PRO_DOCUSIGN_SANDBOX_BASE_URL'],
  },
  docs:['https://developers.docusign.com/docs/esign-rest-api/','https://developers.docusign.com/platform/auth/jwt/','https://developers.docusign.com/platform/webhooks/connect/hmac/'],
  config:esignConfig,
 },
 google:{
  id:'google',kind:'workspace',
  name:{es:'Google · Gmail, Calendar y Drive',en:'Google · Gmail, Calendar and Drive'},
  purpose:{es:'Enviar correos de proyecto desde su buzón, sincronizar citas y tareas con su calendario y adjuntar archivos de Drive.',en:'Send project emails from your mailbox, sync appointments and tasks with your calendar and attach Drive files.'},
  env:{
   sandbox:['PRO_GOOGLE_OAUTH_SANDBOX_CLIENT_ID','PRO_GOOGLE_OAUTH_SANDBOX_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],
   production:['PRO_GOOGLE_OAUTH_PROD_CLIENT_ID','PRO_GOOGLE_OAUTH_PROD_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],
   optional:[],
  },
  docs:['https://developers.google.com/identity/protocols/oauth2/web-server','https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send','https://developers.google.com/calendar/api/v3/reference/events','https://developers.google.com/drive/picker/guides/overview'],
  config:workspaceConfig,
 },
 microsoft:{
  id:'microsoft',kind:'workspace',
  name:{es:'Microsoft · Outlook, Calendario y OneDrive',en:'Microsoft · Outlook, Calendar and OneDrive'},
  purpose:{es:'Lo mismo con una cuenta de Microsoft 365 u Outlook.com.',en:'The same with a Microsoft 365 or Outlook.com account.'},
  env:{
   sandbox:['PRO_MICROSOFT_OAUTH_SANDBOX_CLIENT_ID','PRO_MICROSOFT_OAUTH_SANDBOX_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],
   production:['PRO_MICROSOFT_OAUTH_PROD_CLIENT_ID','PRO_MICROSOFT_OAUTH_PROD_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],
   optional:['PRO_MICROSOFT_OAUTH_TENANT'],
  },
  docs:['https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow','https://learn.microsoft.com/graph/api/user-sendmail','https://learn.microsoft.com/graph/api/resources/event','https://learn.microsoft.com/onedrive/developer/controls/file-pickers/'],
  config:workspaceConfig,
 },
 quickbooks:{
  id:'quickbooks',kind:'accounting',
  name:{es:'QuickBooks Online · Contabilidad',en:'QuickBooks Online · Accounting'},
  purpose:{es:'Sincronizar clientes, facturas y pagos con QuickBooks (o exportar CSV para cualquier sistema contable).',en:'Sync customers, invoices and payments with QuickBooks (or export CSV for any accounting system).'},
  env:{
   sandbox:['PRO_QUICKBOOKS_SANDBOX_CLIENT_ID','PRO_QUICKBOOKS_SANDBOX_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],
   production:['PRO_QUICKBOOKS_PROD_CLIENT_ID','PRO_QUICKBOOKS_PROD_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],
   optional:[],
  },
  docs:['https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0','https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice','https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture'],
  config:quickbooksConfig,
 },
 ai:{
  id:'ai',kind:'ai',
  name:{es:'Asistente de IA · Anthropic Claude',en:'AI assistant · Anthropic Claude'},
  purpose:{es:'Sugerir textos (cotización, cláusulas, bitácora, avances), leer planos, gastos y reuniones. Todo es una sugerencia que usted revisa antes de guardar.',en:'Suggest text (quotes, clauses, daily logs, updates), read plans, expenses and meetings. Everything is a suggestion you review before saving.'},
  env:{sandbox:['PRO_ANTHROPIC_API_KEY'],production:['PRO_ANTHROPIC_API_KEY'],optional:['PRO_ANTHROPIC_MODEL','PRO_ANTHROPIC_BASE_URL']},
  docs:['https://docs.claude.com/en/api/messages','https://docs.claude.com/en/docs/build-with-claude/structured-outputs','https://www.anthropic.com/pricing#api'],
  config:aiConfig,
 },
 transcription:{
  id:'transcription',kind:'transcription',
  name:{es:'Transcripción de audio · API compatible con OpenAI',en:'Audio transcription · OpenAI-compatible API'},
  purpose:{es:'Convertir notas de voz y grabaciones de reuniones (con consentimiento de todas las partes) en texto.',en:'Turn voice notes and meeting recordings (with everyone\'s consent) into text.'},
  env:{sandbox:['PRO_TRANSCRIPTION_API_KEY'],production:['PRO_TRANSCRIPTION_API_KEY'],optional:['PRO_TRANSCRIPTION_BASE_URL','PRO_TRANSCRIPTION_MODEL']},
  docs:['https://platform.openai.com/docs/api-reference/audio/createTranscription','https://platform.openai.com/docs/guides/speech-to-text'],
  config:transcriptionConfig,
 },
 marketing_email:{
  id:'marketing_email',kind:'marketing_email',
  name:{es:'Correo de campañas · Brevo',en:'Campaign email · Brevo'},
  purpose:{es:'Enviar campañas y automatizaciones a contactos que dieron su consentimiento, con enlace de baja.',en:'Send campaigns and automations to contacts who gave consent, with an unsubscribe link.'},
  env:{sandbox:['PRO_MARKETING_BREVO_SANDBOX_API_KEY'],production:['PRO_MARKETING_BREVO_API_KEY'],optional:['PRO_MARKETING_BREVO_BASE_URL']},
  docs:['https://developers.brevo.com/reference/sendtransacemail','https://developers.brevo.com/docs/transactional-webhooks','https://www.prodhab.go.cr/'],
  config:marketingEmailConfig,
 },
 meta_ads:{
  id:'meta_ads',kind:'ads',
  name:{es:'Meta Ads · Importar costos',en:'Meta Ads · Import costs'},
  purpose:{es:'Traer el gasto diario de sus campañas de Facebook/Instagram al reporte de costo por solicitud (en lugar de anotarlo a mano).',en:'Bring the daily spend of your Facebook/Instagram campaigns into the cost-per-lead report (instead of typing it).'},
  env:{sandbox:['PRO_META_ADS_APP_ID','PRO_META_ADS_APP_SECRET',OAUTH_TOKEN_KEY_ENV],production:['PRO_META_ADS_APP_ID','PRO_META_ADS_APP_SECRET',OAUTH_TOKEN_KEY_ENV],optional:[]},
  docs:['https://developers.facebook.com/docs/marketing-api/insights','https://developers.facebook.com/docs/marketing-api/overview/authorization'],
  config:adsConfig,
 },
 google_ads:{
  id:'google_ads',kind:'ads',
  name:{es:'Google Ads · Importar costos',en:'Google Ads · Import costs'},
  purpose:{es:'Traer el costo diario de sus campañas de Google Ads al mismo reporte.',en:'Bring the daily cost of your Google Ads campaigns into the same report.'},
  env:{sandbox:['PRO_GOOGLE_ADS_DEVELOPER_TOKEN','PRO_GOOGLE_ADS_OAUTH_CLIENT_ID','PRO_GOOGLE_ADS_OAUTH_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],production:['PRO_GOOGLE_ADS_DEVELOPER_TOKEN','PRO_GOOGLE_ADS_OAUTH_CLIENT_ID','PRO_GOOGLE_ADS_OAUTH_CLIENT_SECRET',OAUTH_TOKEN_KEY_ENV],optional:['PRO_GOOGLE_ADS_LOGIN_CUSTOMER_ID']},
  docs:['https://developers.google.com/google-ads/api/docs/start','https://developers.google.com/google-ads/api/docs/reporting/overview'],
  config:adsConfig,
 },
 product_clipper:{
  id:'product_clipper',kind:'clipper',
  name:{es:'Agregar desde enlace · Lector de páginas públicas',en:'Add from link · Public page reader'},
  purpose:{es:'Leer nombre, precio e imagen de una página pública de producto (Open Graph / schema.org), respetando robots.txt. Usted revisa antes de guardar.',en:'Read name, price and image from a public product page (Open Graph / schema.org), respecting robots.txt. You review before saving.'},
  env:{sandbox:['PRO_CLIPPER_ENABLE_FETCH'],production:['PRO_CLIPPER_ENABLE_FETCH'],optional:['PRO_CLIPPER_USER_AGENT']},
  docs:['https://ogp.me/','https://schema.org/Product','https://www.rfc-editor.org/rfc/rfc9309'],
  config:clipperConfig,
 },
 site_domain:{
  id:'site_domain',kind:'domain',
  name:{es:'Dominio propio del sitio · Cloudflare for SaaS',en:'Custom website domain · Cloudflare for SaaS'},
  purpose:{es:'Servir su sitio web en su propio dominio (por ejemplo, www.suempresa.cr) con certificado automático.',en:'Serve your website on your own domain (for example, www.yourcompany.cr) with an automatic certificate.'},
  env:{sandbox:['PRO_CLOUDFLARE_ZONE_ID','PRO_CLOUDFLARE_API_TOKEN'],production:['PRO_CLOUDFLARE_ZONE_ID','PRO_CLOUDFLARE_API_TOKEN'],optional:[]},
  docs:['https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/','https://developers.cloudflare.com/api/resources/custom_hostnames/'],
  config:domainConfig,
 },
};
export const providerSchema=z.enum(integrationProviders);
export const modeSchema=z.enum(integrationModes);
export const connectionSchema=z.object({
 provider:providerSchema,mode:modeSchema,enabled:z.boolean(),config:z.record(z.string(),z.unknown()),revision:z.number().int().min(0),
 lastTestAt:z.string().nullable(),lastTestOk:z.boolean().nullable(),lastTestMode:modeSchema.nullable(),lastTestMessage:z.string().nullable(),
 productionConfirmedAt:z.string().nullable(),updatedAt:z.string().nullable(),
});
export type IntegrationConnection=z.infer<typeof connectionSchema>;
/** Default non-secret config of a provider merged with what was saved (unknown keys dropped). */
export function providerConfig(provider:IntegrationProvider,saved:Record<string,unknown>|undefined){
 const schema=providerRegistry[provider].config as z.ZodObject<z.ZodRawShape>;
 const keys=Object.keys(schema.shape),picked=Object.fromEntries(Object.entries(saved??{}).filter(([key])=>keys.includes(key)));
 const parsed=schema.safeParse(picked);return (parsed.success?parsed.data:schema.parse({})) as Record<string,unknown>;
}
export type ResolvedStatus='ready'|'missing_keys'|'production_refused'|'disabled';
export const integrationMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('set_mode'),actionId:z.string().uuid(),provider:providerSchema,revision:z.number().int().min(0),mode:modeSchema,confirm:z.string().max(40).optional()}).strict(),
 z.object({action:z.literal('save_config'),actionId:z.string().uuid(),provider:providerSchema,revision:z.number().int().min(0),config:z.record(z.string(),z.unknown())}).strict(),
 z.object({action:z.enum(['enable','disable']),actionId:z.string().uuid(),provider:providerSchema,revision:z.number().int().min(0)}).strict(),
 z.object({action:z.literal('test'),actionId:z.string().uuid(),provider:providerSchema}).strict(),
]);
