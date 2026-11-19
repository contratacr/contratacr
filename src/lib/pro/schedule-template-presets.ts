import type {ScheduleTemplateDetail} from './schedule-templates';
/** Original editable examples. Offsets illustrate a sequence, never a promised delivery duration. */
type Definition=Pick<ScheduleTemplateDetail,'name'|'notes'|'phases'|'tasks'|'milestones'>;
type Stage={es:string;en:string;taskEs:string;taskEn:string;start:number;end:number};
export type ScheduleTemplatePreset={id:string;es:string;en:string;stages:Stage[];finishEs:string;finishEn:string};
export const scheduleTemplatePresets:ScheduleTemplatePreset[]=[
 {id:'kitchen',es:'Remodelación de cocina',en:'Kitchen remodel',finishEs:'Entrega de cocina',finishEn:'Kitchen handover',stages:[
  {es:'Preparación',en:'Preparation',taskEs:'Definir alcance y medidas',taskEn:'Confirm scope and measurements',start:0,end:2},
  {es:'Diseño y materiales',en:'Design and materials',taskEs:'Acordar diseño y confirmar materiales',taskEn:'Agree on design and confirm materials',start:3,end:7},
  {es:'Instalación',en:'Installation',taskEs:'Coordinar e instalar los elementos acordados',taskEn:'Coordinate and install the agreed elements',start:8,end:14},
  {es:'Entrega',en:'Handover',taskEs:'Revisar acabados y pendientes con el cliente',taskEn:'Review finishes and outstanding items with the client',start:15,end:16}]},
 {id:'bathroom',es:'Remodelación de baño',en:'Bathroom remodel',finishEs:'Entrega de baño',finishEn:'Bathroom handover',stages:[
  {es:'Revisión inicial',en:'Initial review',taskEs:'Revisar medidas, instalaciones y alcance',taskEn:'Review measurements, existing systems and scope',start:0,end:1},
  {es:'Preparación',en:'Preparation',taskEs:'Confirmar acabados y disponibilidad de materiales',taskEn:'Confirm finishes and material availability',start:2,end:5},
  {es:'Ejecución',en:'Execution',taskEs:'Coordinar los trabajos y las instalaciones acordadas',taskEn:'Coordinate the agreed work and installations',start:6,end:12},
  {es:'Entrega',en:'Handover',taskEs:'Revisar funcionamiento y acabados con el cliente',taskEn:'Review operation and finishes with the client',start:13,end:14}]},
 {id:'residential',es:'Construcción de vivienda',en:'Residential new build',finishEs:'Revisión de entrega',finishEn:'Handover review',stages:[
  {es:'Alcance y planificación',en:'Scope and planning',taskEs:'Confirmar alcance, responsables y documentos necesarios',taskEn:'Confirm scope, responsibilities and required documents',start:0,end:7},
  {es:'Preparación del sitio',en:'Site preparation',taskEs:'Coordinar preparación y acceso al sitio',taskEn:'Coordinate site preparation and access',start:8,end:14},
  {es:'Obra principal',en:'Main construction',taskEs:'Organizar la ejecución de la obra acordada',taskEn:'Organize execution of the agreed construction work',start:15,end:60},
  {es:'Instalaciones y acabados',en:'Systems and finishes',taskEs:'Coordinar instalaciones, acabados y revisiones',taskEn:'Coordinate systems, finishes and inspections',start:61,end:90},
  {es:'Cierre',en:'Closeout',taskEs:'Registrar pendientes y realizar revisión con el cliente',taskEn:'Record outstanding items and review with the client',start:91,end:95}]},
 {id:'design-build',es:'Diseño de interiores con obra',en:'Interior design with construction',finishEs:'Entrega del espacio',finishEn:'Space handover',stages:[
  {es:'Necesidades',en:'Requirements',taskEs:'Definir necesidades, medidas y presupuesto de referencia',taskEn:'Define needs, measurements and budget expectations',start:0,end:2},
  {es:'Propuesta',en:'Proposal',taskEs:'Presentar y acordar la propuesta de diseño',taskEn:'Present and agree on the design proposal',start:3,end:7},
  {es:'Coordinación de obra',en:'Construction coordination',taskEs:'Coordinar materiales y ejecución del diseño aprobado',taskEn:'Coordinate materials and execution of the approved design',start:8,end:21},
  {es:'Entrega',en:'Handover',taskEs:'Revisar montaje, acabados y pendientes',taskEn:'Review installation, finishes and outstanding items',start:22,end:24}]},
 {id:'design',es:'Diseño de interiores sin obra',en:'Interior design without construction',finishEs:'Entrega de diseño',finishEn:'Design handover',stages:[
  {es:'Revisión del espacio',en:'Space review',taskEs:'Revisar necesidades y medidas del espacio',taskEn:'Review needs and space measurements',start:0,end:1},
  {es:'Propuesta',en:'Proposal',taskEs:'Preparar y revisar opciones con el cliente',taskEn:'Prepare and review options with the client',start:2,end:5},
  {es:'Selección y montaje',en:'Selection and installation',taskEs:'Confirmar productos y coordinar el montaje acordado',taskEn:'Confirm products and coordinate the agreed installation',start:6,end:10},
  {es:'Cierre',en:'Closeout',taskEs:'Entregar recomendaciones y revisar pendientes',taskEn:'Deliver recommendations and review outstanding items',start:11,end:12}]},
 {id:'remodel',es:'Remodelación integral',en:'Full home remodel',finishEs:'Entrega de remodelación',finishEn:'Remodel handover',stages:[
  {es:'Diagnóstico',en:'Assessment',taskEs:'Revisar el inmueble y definir el alcance',taskEn:'Assess the property and define scope',start:0,end:3},
  {es:'Plan de trabajo',en:'Work plan',taskEs:'Acordar prioridades, etapas y materiales',taskEn:'Agree on priorities, stages and materials',start:4,end:10},
  {es:'Ejecución por áreas',en:'Work by area',taskEs:'Coordinar las áreas de trabajo y las entregas parciales',taskEn:'Coordinate work areas and phased handovers',start:11,end:40},
  {es:'Revisión final',en:'Final review',taskEs:'Revisar calidad, funcionamiento y pendientes',taskEn:'Review quality, operation and outstanding items',start:41,end:45}]},
 {id:'lead',es:'Seguimiento de solicitud',en:'Lead follow-up',finishEs:'Revisar siguiente paso',finishEn:'Review next step',stages:[
  {es:'Contacto inicial',en:'Initial contact',taskEs:'Revisar la solicitud y confirmar lo que necesita el cliente',taskEn:'Review the request and confirm the client’s needs',start:0,end:0},
  {es:'Revisión del servicio',en:'Service review',taskEs:'Coordinar una visita o aclarar los detalles necesarios',taskEn:'Arrange a visit or clarify the required details',start:1,end:2},
  {es:'Cotización',en:'Quote',taskEs:'Preparar la cotización para revisión del cliente',taskEn:'Prepare the quote for the client to review',start:3,end:4},
  {es:'Seguimiento',en:'Follow-up',taskEs:'Consultar dudas y acordar el siguiente paso',taskEn:'Answer questions and agree on the next step',start:5,end:6}]},
];
export function createScheduleTemplatePreset(id:string,locale:'es'|'en'):Definition{
 const preset=scheduleTemplatePresets.find(value=>value.id===id);if(!preset)throw Error('Unknown plan example');
 const en=locale==='en',phases=preset.stages.map((stage,position)=>({id:crypto.randomUUID(),title:en?stage.en:stage.es,position}));
 const taskIds=preset.stages.map(()=>crypto.randomUUID());
 return{name:en?preset.en:preset.es,notes:en?'Example dates. Review and adjust them before applying.':'Fechas de ejemplo. Revíselas y ajústelas antes de aplicar.',phases,tasks:preset.stages.map((stage,index)=>({id:taskIds[index],title:en?stage.taskEn:stage.taskEs,details:'',assignee:'',dueOffset:null,phaseId:phases[index].id,startOffset:stage.start,endOffset:stage.end,dependsOn:index?[taskIds[index-1]]:[]})),milestones:[{id:crypto.randomUUID(),title:en?preset.finishEn:preset.finishEs,offset:preset.stages.at(-1)!.end+1,notes:''}]};
}
