import {MAX_MONEY_AMOUNT} from '@/lib/money-limits';

/** Quotes store whole colones. Never reinterpret punctuation as extra digits. */
export function parseQuotePriceInput(value:string):number|null{
 if(!/^\d+$/.test(value))return null;
 const amount=Number(value);
 return Number.isSafeInteger(amount)&&amount<=MAX_MONEY_AMOUNT?amount:null;
}
