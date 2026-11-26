// LOCAL PRO ONLY (multivertical F1/F2). Shapes returned by docs/pro/sql/directory-core-local.sql.
// Not imported by any route yet: wiring is listed in the F1/F2 wiring notes.

// 2026-11-17: + the eleven place sections approved by the owner (src/lib/directory/place-verticals.ts).
export const DIRECTORY_VERTICALS=['restaurant','fuel','pharmacy','grocery','vehicle_dealer','real_estate',
 'cafe_bar','convenience','hardware','lodging','health','vet_pets','auto_services','beauty','fitness','tours','banking',
 'parking','car_wash',
 // 2026-11-26 (migration 537): everything else people look for in OSM.
 'attraction','retail','mall','food_shop','government','education','transport'] as const;
export type DirectoryVertical=typeof DIRECTORY_VERTICALS[number];
export const PLACE_STATUSES=['draft','published','hidden','closed_permanently','removed'] as const;
export type PlaceStatus=typeof PLACE_STATUSES[number];
export const VERIFICATION_LEVELS=['unverified','imported','claimed','verified','license_verified'] as const;
export type VerificationLevel=typeof VERIFICATION_LEVELS[number];
export const LOCATION_PRECISIONS=['exact','street','locality','area','unknown'] as const;
export type LocationPrecision=typeof LOCATION_PRECISIONS[number];
export const REPORT_KINDS=['wrong_info','closed','duplicate','removal_request','abuse','other'] as const;
export type ReportKind=typeof REPORT_KINDS[number];

/** dir_place_public(slug): no internal ids, actor ids or revision are ever exposed. */
export type PublicPlace={
 slug:string;name:string;
 vertical:{id:DirectoryVertical;nameEs:string;nameEn:string;pathEs:string;pathEn:string};
 countryCode:string;currency:string;
 address:{adminArea1:string|null;adminArea2:string|null;adminArea3:string|null;locality:string|null;line:string|null};
 location:{lat:number;lng:number;precision:LocationPrecision}|null;
 phone:string|null;website:string|null;attributes:Record<string,unknown>;
 status:'published'|'closed_permanently';verificationLevel:VerificationLevel;
 rating:{average:number|null;count:number};
 hours:{weekday:number;opens:string;closes:string}[];
 media:{kind:'photo'|'logo';url:string;altEs:string|null;altEn:string|null}[];
 /** Attribution of the public sources currently backing a field (e.g. OpenStreetMap, ODbL 1.0). */
 sources:{name:string;license:string;attribution:string;url:string|null}[];
 updatedAt:string;
};
export type PlaceMutationResult={action:string;placeId:string;slug:string;revision:number;status:PlaceStatus;verificationLevel:VerificationLevel};
export type ImportSummary={batchId:string;sourceId:string;status:'staged'|'committed'|'cancelled';rows:number;
 counts:{staged:number;accepted:number;rejected:number;duplicate:number};reasons:Record<string,number>};

/** Weekday labels; 0 = Sunday, as stored in dir_place_hours. */
export const WEEKDAYS={es:['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']} as const;
export const VERIFICATION_LABELS:Record<VerificationLevel,{es:string;en:string}>={
 unverified:{es:'Sin verificar',en:'Not verified'},
 imported:{es:'No reclamado',en:'Unclaimed'},// quiet badge (2026-11-19); the data sources are explained in the Terms (13.1)
 claimed:{es:'Administrado por el negocio',en:'Managed by the business'},
 verified:{es:'Verificado por ContrataCR',en:'Verified by ContrataCR'},
 license_verified:{es:'Permiso de funcionamiento verificado',en:'Operating license verified'},
};
