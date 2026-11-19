import 'server-only';
import {dirFail} from './public-route';

// Database error of the place photo functions → {status, reason} (reasons translated by PHOTO_REASON_TEXT).
const HINTS:Record<string,[number,string]>={dir_photo_duplicate:[409,'duplicate'],dir_photo_cap:[429,'cap'],dir_photo_place_cap:[409,'place_cap'],
 dir_photo_review_missing:[400,'review_missing'],dir_photo_review_cap:[409,'review_cap'],dir_review_own_place:[403,'own_place'],dir_photo_not_owner:[403,'not_owner'],
 dir_tool_role:[403,'forbidden'],dir_tool_not_manager:[403,'forbidden']};
export function photoDbError(error:{code?:string;hint?:string}){
 const h=error.hint&&HINTS[error.hint];if(h)return dirFail(h[0],h[1]);
 switch(error.code){
  case '22023':case '23514':case '22P02':return dirFail(400,'invalid','Revise la foto.');
  case '23505':return dirFail(409,'duplicate');case '40001':return dirFail(409,'reload');case '42501':return dirFail(403,'forbidden');
  case '54000':return dirFail(429,'cap');case 'P0002':return dirFail(404,'not_found');default:return dirFail(503,'unavailable');
 }
}
