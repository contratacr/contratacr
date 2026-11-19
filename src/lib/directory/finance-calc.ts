// LOCAL PRO ONLY (multivertical V4/V7). Illustrative installment calculator for listings whose dealer DECLARED a
// financing rate. Pure function, integer minor units (céntimos / cents), French amortization (constant payment):
//   payment = P · i / (1 − (1 + i)^−n), with i = annual rate / 12; i = 0 → P / n.
// It is NOT a credit offer: the UI must always show FINANCE_DISCLAIMER next to the result.

export type FinanceInput={
 /** Vehicle price in minor units. */
 priceMinor:number;
 /** Down payment in minor units (0 ≤ down < price). */
 downPaymentMinor:number;
 /** Nominal annual rate declared by the dealer, in percent (0–60). */
 annualRatePct:number;
 /** Term in months (1–120). */
 termMonths:number;
};
export type FinanceResult={
 principalMinor:number;
 /** Constant monthly payment, rounded to the minor unit (the last payment absorbs the rounding). */
 monthlyPaymentMinor:number;
 lastPaymentMinor:number;
 totalPaidMinor:number;
 totalInterestMinor:number;
 termMonths:number;
};
export type FinanceError='invalid_price'|'invalid_down_payment'|'invalid_rate'|'invalid_term';

export const FINANCE_LIMITS={maxRatePct:60,minTermMonths:1,maxTermMonths:120} as const;

export const FINANCE_DISCLAIMER={
 es:'Cálculo ilustrativo con la tasa que declaró el vendedor. No es una oferta ni una aprobación de crédito y no incluye seguros, comisiones, gastos de formalización ni variaciones de la tasa. Confirme las condiciones con la entidad que financia.',
 en:'Illustrative estimate using the rate declared by the seller. It is not a credit offer or approval and it excludes insurance, fees, closing costs and rate changes. Please confirm the terms with the lender.',
} as const;

const isInt=(n:number)=>Number.isSafeInteger(n);

/** Returns the schedule summary, or an error code for invalid input (never throws). */
export function frenchAmortization(input:FinanceInput):{ok:true;value:FinanceResult}|{ok:false;error:FinanceError}{
 const {priceMinor,downPaymentMinor,annualRatePct,termMonths}=input;
 if(!isInt(priceMinor)||priceMinor<=0)return {ok:false,error:'invalid_price'};
 if(!isInt(downPaymentMinor)||downPaymentMinor<0||downPaymentMinor>=priceMinor)return {ok:false,error:'invalid_down_payment'};
 if(!Number.isFinite(annualRatePct)||annualRatePct<0||annualRatePct>FINANCE_LIMITS.maxRatePct)return {ok:false,error:'invalid_rate'};
 if(!isInt(termMonths)||termMonths<FINANCE_LIMITS.minTermMonths||termMonths>FINANCE_LIMITS.maxTermMonths)return {ok:false,error:'invalid_term'};
 const principal=priceMinor-downPaymentMinor,i=annualRatePct/100/12,n=termMonths;
 const exact=i===0?principal/n:principal*i/(1-Math.pow(1+i,-n));
 const payment=Math.round(exact);
 // Walk the schedule with per-period rounding of interest so the last payment closes the balance exactly.
 let balance=principal,interestTotal=0,last=payment;
 for(let k=1;k<=n;k++){
  const interest=Math.round(balance*i);interestTotal+=interest;
  if(k===n){last=balance+interest;balance=0;}
  else balance=balance+interest-payment;
 }
 const totalPaid=payment*(n-1)+last;
 return {ok:true,value:{principalMinor:principal,monthlyPaymentMinor:payment,lastPaymentMinor:last,totalPaidMinor:totalPaid,totalInterestMinor:interestTotal,termMonths:n}};
}
