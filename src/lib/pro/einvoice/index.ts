import {MockEinvoiceProvider} from './mock-provider';
import {EinvoiceProviderRefused,providerModeOf,type EinvoiceEnv,type EinvoiceProvider,type EinvoiceProviderId} from './provider';
import {GtiProvider,HaciendaSandboxProvider} from './stub-providers';

export * from './provider';
export {MockEinvoiceProvider,MOCK_EINVOICE_FIXTURES,mockRejections} from './mock-provider';
export {GtiProvider,HaciendaSandboxProvider} from './stub-providers';
/** Signer interface (XAdES-EPES enveloped) and the local mock signer live with the v4.4 builder. */
export {MockSigner,type EinvoiceSigner,type SignedDocument,type SignableType} from '../integrations/hacienda/signer';

/**
 * Ronda F2-A: the adapter for one document. A MOCK document always uses the simulator (whatever the env says);
 * a sandbox/production document needs the provider chosen in the emisor settings AND the server env for it —
 * otherwise EinvoiceProviderRefused (the pipeline turns it into a 409 without touching the document).
 */
export function einvoiceProviderFor(mode:'mock'|'sandbox'|'production',provider:EinvoiceProviderId,env:EinvoiceEnv=process.env):EinvoiceProvider{
 if(mode==='mock')return new MockEinvoiceProvider();
 const providerMode=providerModeOf(mode) as 'sandbox'|'live';
 if(provider==='hacienda-sandbox')return new HaciendaSandboxProvider(providerMode,env);
 if(provider==='gti')return new GtiProvider(providerMode,env);
 throw new EinvoiceProviderRefused('mock','not_configured');
}
