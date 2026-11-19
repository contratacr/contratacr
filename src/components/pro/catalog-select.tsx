'use client';
import { useLocale } from 'next-intl';
import { businessSchema,type Client,type Product } from '@/lib/pro/business';
import { PagedSelect } from './paged-select';
export function CatalogSelect<K extends 'clients'|'products'>({kind,itemType,...props}:{kind:K;itemType?:'all'|'product'|'service';value:string;label:string;name?:string;required?:boolean;disabled?:boolean;selected?:K extends 'clients'?Client:Product;onChange:(row:(K extends 'clients'?Client:Product)|undefined)=>void;onRows?:(rows:(K extends 'clients'?Client:Product)[])=>void}){
 const en=useLocale()==='en';
 type Row=K extends 'clients'?Client:Product;
 return <PagedSelect<Row> {...props} url={'/api/pro/catalog?kind='+kind+(kind==='products'&&itemType?'&itemType='+itemType:'')} placeholder={kind==='clients'?(en?'Choose a customer':'Seleccione un cliente'):(itemType==='product'?(en?'Choose a product':'Seleccione un producto'):(en?'Choose a product or service':'Seleccione un producto o servicio'))}
 searchLabel={kind==='clients'?(en?'Search saved customers':'Buscar clientes guardados'):(itemType==='product'?(en?'Search products':'Buscar productos'):(en?'Search catalog':'Buscar en catálogo'))} moreLabel={en?'Show more options':'Ver más opciones'} optionLabel={r=>r.name+('itemType' in r&&r.itemType==='service'?(en?' · Service':' · Servicio'):'')}
 parse={body=>{const b=body as {items?:unknown;document?:Record<string,unknown>};return businessSchema.shape[kind].parse(b.items??b.document?.[kind]) as Row[];}}
 detailUrl={id=>'/api/pro/catalog?'+new URLSearchParams({kind,id,option:'1',...(kind==='products'&&itemType?{itemType}:{})})}/>;
}
