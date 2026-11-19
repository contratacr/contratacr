import { clientSchema,productSchema } from './business';
// PostgreSQL represents absent optional columns as NULL; the domain contract omits them.
function optionalColumns(row:Record<string,unknown>){return Object.fromEntries(Object.entries(row).filter(([,value])=>value!==null));}
export const readClientRecord=(row:Record<string,unknown>)=>clientSchema.parse(optionalColumns(row));
export const readProductRecord=(row:Record<string,unknown>)=>productSchema.parse(optionalColumns(row));
