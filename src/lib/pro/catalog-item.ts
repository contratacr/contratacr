import type {Product} from './business';
import {blankInvoiceLine,type EditableInvoiceLine} from './invoice-detail';
/** Missing discriminator belongs to the original stock catalog; never infer from quantity or CABYS. */
export function isStockItem(item:Product){return item.itemType!=='service';}
/** Copy a quote-independent draft line. Services have no inventory reference or stock side effects. */
export function catalogInvoiceLine(item:Product):EditableInvoiceLine{return {...blankInvoiceLine(),kind:isStockItem(item)?'product':'service',productId:isStockItem(item)?item.id:null,sku:item.sku,description:item.name,unit:item.unit??'',cabys:item.cabys??'',unitPrice:String(Number(item.price.toFixed(5)))};}
