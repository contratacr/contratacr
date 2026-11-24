'use client';
import {contactFormLabel,contactFormVisibleOrder,type ContactFormBuiltinId,type ContactFormConfig,type ContactFormErrorKey} from '@/lib/pro/contact-form';

/** The fields of a contact form, shared by the public page and the builder preview. Controlled; the page owns the values. */
export type ContactFormValues=Record<string,string|string[]>;
const input='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543] disabled:opacity-60';
export const contactFormErrorText=(key:ContactFormErrorKey,en:boolean)=>key==='required'?(en?'This field is required.':'Este campo es obligatorio.'):key==='email'?(en?'Enter a valid email.':'Escriba un correo válido.'):key==='phone'?(en?'Enter a phone number with 8 to 15 digits.':'Escriba un teléfono de 8 a 15 dígitos.'):key==='choice'?(en?'Choose one of the options.':'Elija una de las opciones.'):(en?'This answer is too long.':'Esta respuesta es demasiado larga.');
export const contactFormConsentText=(en:boolean)=>en?'I agree that you may contact me by email or phone about my request.':'Acepto que se comuniquen conmigo por correo o teléfono sobre mi solicitud.';
export function ContactFormFields({config,en,values,errors,disabled,onChange}:{config:ContactFormConfig;en:boolean;values:ContactFormValues;errors:Record<string,ContactFormErrorKey>;disabled?:boolean;onChange:(id:string,value:string|string[])=>void}){
 const language=en?'en':'es',text=(id:string)=>typeof values[id]==='string'?values[id] as string:'';
 return <div className="space-y-4">{contactFormVisibleOrder(config).map(id=>{
  const question=config.questions.find(q=>q.id===id);
  const builtin=(['name','email','phone','zip','address','message'] as const).includes(id as ContactFormBuiltinId)?id as ContactFormBuiltinId:null;
  const required=builtin?(builtin==='zip'||builtin==='address'?config[builtin].required:true):!!question?.required;
  const label=builtin?contactFormLabel(config,builtin,language):question?.label??'';
  const err=errors[id],described=err?'cf-err-'+id:undefined;
  const mark=required?<span aria-hidden="true" className="text-red-700"> *</span>:null;
  const errNode=err&&<p id={described} role="alert" className="mt-1 text-sm text-red-700">{contactFormErrorText(err,en)}</p>;
  if(question&&(question.type==='single'||question.type==='multiple')){
   const list=Array.isArray(values[id])?values[id] as string[]:text(id)?[text(id)]:[];
   return <fieldset key={id} data-contact-field={id} className="min-w-0"><legend className="text-sm font-semibold">{label}{mark}</legend>
    <div className="mt-1 space-y-1">{question.options.map(option=><label key={option} className="flex min-h-11 items-center gap-2 text-sm font-normal"><input type={question.type==='single'?'radio':'checkbox'} name={'cf-'+id} checked={list.includes(option)} disabled={disabled} onChange={e=>onChange(id,question.type==='single'?option:e.target.checked?[...list,option]:list.filter(x=>x!==option))}/>{option}</label>)}</div>{errNode}</fieldset>;
  }
  const long=builtin==='message'||question?.type==='long';
  const common={id:'cf-'+id,'aria-required':required,'aria-invalid':!!err,'aria-describedby':described,disabled,className:input,value:text(id),onChange:(e:{target:{value:string}})=>onChange(id,e.target.value)};
  return <div key={id} data-contact-field={id} className="min-w-0"><label htmlFor={'cf-'+id} className="block text-sm font-semibold">{label}{mark}</label>
   {long?<textarea rows={4} maxLength={2000} {...common}/>:<input type={builtin==='email'?'email':builtin==='phone'?'tel':'text'} autoComplete={builtin==='name'?'name':builtin==='email'?'email':builtin==='phone'?'tel':builtin==='zip'?'postal-code':builtin==='address'?'street-address':'off'} maxLength={builtin==='zip'?10:builtin==='address'?300:question?.type==='short'?200:builtin==='email'?254:builtin==='phone'?30:120} {...common}/>}{errNode}</div>;
 })}</div>;
}
