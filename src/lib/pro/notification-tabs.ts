import type {NotificationEvent} from '@/lib/pro/round9';

/** Area A: the notification center splits into "General" and "Comments" (messages and replies written by customers). */
export const commentEvents:readonly NotificationEvent[]=['client_message','quote_changes','selection_decided'];
export type NotificationTab='all'|'general'|'comments';
export const notificationTabs:NotificationTab[]=['all','general','comments'];
export function notificationTabOf(event:NotificationEvent):Exclude<NotificationTab,'all'>{return commentEvents.includes(event)?'comments':'general';}
export function inNotificationTab(event:NotificationEvent,tab:NotificationTab){return tab==='all'||notificationTabOf(event)===tab;}
export const notificationTabLabels:Record<NotificationTab,[string,string]>={all:['Todos','All'],general:['General','General'],comments:['Comentarios','Comments']};
