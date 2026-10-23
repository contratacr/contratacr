/** Provider-independent contracts. No adapter is enabled and no credentials are read. */
export type SubscriptionOrder = {
 id: string; userId: string; amountMinor: number; currency: 'CRC' | 'USD';
 provider: 'tilopay'; environment: 'test';
};
export type VerifiedPayment = {
 orderId: string; amountMinor: number; currency: string;
 status: 'approved' | 'declined' | 'pending'; environment: string;
 transactionId: string;
};
/** Call only with a server-to-server verified response, never browser query params. */
export function canActivateSubscription(order:SubscriptionOrder,result:VerifiedPayment){
 return Number.isSafeInteger(order.amountMinor)&&order.amountMinor>0&&result.status==='approved'&&
 result.environment==='test'&&result.orderId===order.id&&result.currency===order.currency&&
 result.amountMinor===order.amountMinor&&Boolean(result.transactionId);
}
export type FiscalProvider = {
 kind: 'gti' | 'hacienda';
 // Every document belongs to a particular issuer, never a shared ContrataCR issuer.
 submit: (issuerId:string,documentId:string)=>Promise<{trackingId:string;status:'pending'}>;
 consult: (issuerId:string,trackingId:string)=>Promise<'pending'|'accepted'|'rejected'>;
};
