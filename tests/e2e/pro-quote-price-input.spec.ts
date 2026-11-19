import {test,expect} from 'playwright/test';
import {parseQuotePriceInput} from '../../src/lib/pro/quote-price-input';
import {MAX_MONEY_AMOUNT} from '../../src/lib/money-limits';

test('Pro whole-colon prices preserve valid amounts and reject ambiguous input',()=>{
 for(const [text,value] of [['0',0],['1250',1250],['00020',20],[String(MAX_MONEY_AMOUNT),MAX_MONEY_AMOUNT]] as const){
  expect(parseQuotePriceInput(text)).toBe(value);
 }
 for(const text of ['', ' ', '1250,50', '1250.50', '1.250', '1,250', '1.250,50', '1,250.50', '-20', '+20', '1e3', '₡1250', ' 1250', '1250 ', String(MAX_MONEY_AMOUNT+1), '99999999999999999']){
  expect(parseQuotePriceInput(text),text).toBeNull();
 }
});
