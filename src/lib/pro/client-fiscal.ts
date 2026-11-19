import {z} from 'zod';
export const receiverFiscalShape={
 identificationType:z.enum(['','individual','company','dimex','nite','foreign']),
 activity:z.union([z.literal(''),z.string().regex(/^[0-9.]{1,12}$/,'Use solo dígitos y puntos para la actividad.')]),
 province:z.string().trim().max(80),canton:z.string().trim().max(80),district:z.string().trim().max(80),neighborhood:z.string().trim().max(100),
};
export const emptyReceiverFiscal=()=>({identificationType:'' as const,activity:'',province:'',canton:'',district:'',neighborhood:''});
export const fiscalReceiverSchema=z.object({name:z.string().trim().min(1,'Indique el nombre o razón social.').max(160),identification:z.string().trim().max(40),email:z.union([z.literal(''),z.string().trim().email().max(254)]),phone:z.string().trim().max(30),address:z.string().trim().max(500),...receiverFiscalShape});
export type FiscalReceiver=z.infer<typeof fiscalReceiverSchema>;
export const clientFiscalSettingsSchema=z.object({clientId:z.string().trim().min(1).max(160),revision:z.number().int().min(0),receiver:fiscalReceiverSchema});
