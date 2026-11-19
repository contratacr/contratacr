/**
 * Single CRC display formatter for Pro. es-CR: «₡1.508.550» / «₡1.508.550,50»; English: «₡1,508,550» /
 * «₡1,508,550.50». Negatives are «−₡300.000» (true minus sign). Cents appear only when meaningful.
 * `en` defaults to the page language (<html lang>) in the browser so client-fetched screens agree.
 */
export function proIsEnglish(){return typeof document!=='undefined'&&document.documentElement.lang.toLowerCase().startsWith('en');}
export function proMoney(value:number,en?:boolean,fixedCents=false){
 const english=en??proIsEnglish(),rounded=Math.round(value*100)/100,[whole,cents]=Math.abs(rounded).toFixed(2).split('.');
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,english?',':'.');
 return (rounded<0?'−':'')+'₡'+grouped+(cents==='00'&&!fixedCents?'':(english?'.':',')+cents);
}
