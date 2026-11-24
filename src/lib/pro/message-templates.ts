/** Area C: quick reply templates for the job message composer (Houzz: Interested, Unavailable, Not a Fit). */
export const messageTemplates=[
 {id:'interested',es:{label:'Interesado',body:'Hola {name}, gracias por escribirnos. Nos interesa su proyecto y con gusto coordinamos una visita para conocer los detalles. ¿Qué días y horarios le convienen?'},en:{label:'Interested',body:'Hi {name}, thank you for reaching out. We are interested in your project and would be glad to schedule a visit to review the details. Which days and times work for you?'}},
 {id:'unavailable',es:{label:'No disponible',body:'Hola {name}, gracias por pensar en nosotros. Por ahora no tenemos disponibilidad para tomar su proyecto, pero con gusto lo contactamos cuando se libere nuestra agenda.'},en:{label:'Unavailable',body:'Hi {name}, thank you for thinking of us. We are not available to take on your project right now, but we would be glad to contact you when our schedule opens up.'}},
 {id:'not_a_fit',es:{label:'No es lo que hacemos',body:'Hola {name}, gracias por su consulta. Lamentablemente este tipo de trabajo no es parte de lo que hacemos, y le recomendamos buscar a un profesional especializado en el tema.'},en:{label:'Not a fit',body:'Hi {name}, thank you for your inquiry. Unfortunately this type of work is outside of what we do, and we recommend finding a professional who specializes in it.'}},
] as const;
export function renderMessageTemplate(id:string,en:boolean,name:string){
 const template=messageTemplates.find(item=>item.id===id);if(!template)return '';
 const first=name.trim().split(/\s+/)[0]||(en?'there':'');
 return (en?template.en:template.es).body.replace('{name}',first).replace(/\s+,/g,',').replace('Hola ,','Hola,');
}
