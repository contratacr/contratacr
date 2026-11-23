/**
 * Row 61: external stock-photo source for the idea boards (an Unsplash-type provider). INACTIVE on purpose: the board library
 * only offers the owner's own images (company files and catalog item photos), and nothing imports this adapter into the UI or an API.
 * To turn it on later: set PRO_STOCK_IMAGES_PROVIDER and PRO_STOCK_IMAGES_API_KEY on the server, implement `search` for the chosen
 * provider (respecting its terms: attribution, no hotlinking, download tracking), and copy the chosen image INTO the job as a private
 * job photo through the existing /api/pro/work-files upload (the same path the own library uses), so boards never depend on a third party.
 */
export type StockImageHit={id:string;previewUrl:string;downloadUrl:string;author:string;sourceUrl:string};
export interface StockImageProvider{search(query:string,page:number):Promise<StockImageHit[]>}
export class DisabledStockImages implements StockImageProvider{async search():Promise<StockImageHit[]>{return [];}}
/** Always the disabled provider until a real adapter is implemented and its key is configured. */
export function stockImageProvider():StockImageProvider{return new DisabledStockImages();}
