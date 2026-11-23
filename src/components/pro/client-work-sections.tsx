'use client';
import {AppointmentClientDashboard} from './client-dashboard';
import {ClientJournal} from './work-journal';
import {AppointmentDailyLogs} from './daily-logs';
import {ClientMessages} from './work-messages';
import {AppointmentFiles} from './work-files';
import {AppointmentSharedFolders} from './client-shared-folders';
import {AppointmentBeforeAfter} from './client-before-after';
import {AppointmentAllowances} from './work-allowances';
import {AppointmentBudgetSummary} from './client-budget-summary';
import {AppointmentSelections} from './work-selections';
import {AppointmentMoodBoards} from './appointment-mood-boards';
import {AppointmentSchedule} from './project-schedule';
import {AppointmentPunchlist} from './work-punchlist';
import {AppointmentContracts} from './appointment-contracts';
import {WorkChanges} from './work-changes';
import {AppointmentDelivery} from './work-delivery';
import {AppointmentFinances} from './client-finances';
import {AppointmentQuotes} from './client-project-quotes';
import {AppointmentPaymentPlan} from './client-payment-plan';
import {ClientProjectOverview} from './client-project-overview';
import {ClientPresentation} from './client-presentation';
import {clientSectionAnchor} from '@/lib/pro/round12';
import type {ReactNode} from 'react';

type State={dirty:boolean;busy:boolean};
/**
 * Round 4A: the job sections a linked customer sees in My projects, in one place, so the customer
 * page and the owner's «Customer view» preview render the SAME components with the SAME readers.
 * In the preview the readers run as the linked customer (proCustomerReader) and the owner wraps
 * this tree in a disabled fieldset: nothing here can write on the customer's behalf.
 */
export function ClientWorkSections({requestId,parentBlocked=false,onDailyState,onChangeState,onDeliveryState}:{requestId:string;parentBlocked?:boolean;onDailyState?:(state:State)=>void;onChangeState?:(state:State)=>void;onDeliveryState?:(state:State)=>void}){
 // Round 12: overview first; every section gets an anchor the overview links jump to.
 const at=(section:string,node:ReactNode)=><div id={clientSectionAnchor(requestId,section)} data-client-section={section} className="scroll-mt-24 min-w-0 space-y-4 empty:hidden">{node}</div>;
 return <>
  <ClientPresentation key={'presentation:'+requestId} requestId={requestId}/>
  <ClientProjectOverview key={'overview:'+requestId} requestId={requestId}/>
  <AppointmentClientDashboard key={'dashboard:'+requestId} requestId={requestId}>{view=><>{/* Round 7C: one Daily Log; only entries marked «Visible al cliente». */}{(view.showUpdates||view.showDailyLogs)&&<ClientJournal key={'journal:'+requestId} requestId={requestId} updates={view.showUpdates} dailyLogs={view.showDailyLogs}/>}{/* Formally shared daily logs keep their versions and conversation. */}{view.showDailyLogs&&<AppointmentDailyLogs key={'daily:'+requestId} requestId={requestId} parentBlocked={parentBlocked} onStateChange={onDailyState}/>}{view.showFiles&&at('files',<><AppointmentFiles key={'files:'+requestId} requestId={requestId}/>{/* Ronda F2-D: folders shared with the customer. */}<AppointmentSharedFolders key={'folders:'+requestId} requestId={requestId}/>{/* Row 33: before/after comparisons. */}<AppointmentBeforeAfter key={'comparisons:'+requestId} requestId={requestId}/></>)}</>}</AppointmentClientDashboard>
  {/* Round 7C: messages with the professional of this job (in-app only). */}
  {at('messages',<ClientMessages key={'messages:'+requestId} requestId={requestId}/>)}
  {at('quotes',<AppointmentQuotes key={'quotes:'+requestId} requestId={requestId}/>)}
  {at('finances',<AppointmentFinances key={'finances:'+requestId} requestId={requestId}/>)}
  {at('payment-plan',<AppointmentPaymentPlan key={'payment-plan:'+requestId} requestId={requestId}/>)}
  {/* Row 54: budget summary the professional shared explicitly (groups and sale totals only). */}
  {at('budget',<AppointmentBudgetSummary key={'budget:'+requestId} requestId={requestId}/>)}
  <AppointmentAllowances key={'allowances:'+requestId} requestId={requestId}/>
  {at('selections',<AppointmentSelections key={'selections:'+requestId} requestId={requestId}/>)}
  <AppointmentMoodBoards key={'moodboards:'+requestId} requestId={requestId}/>
  {at('schedule',<AppointmentSchedule key={'schedule:'+requestId} requestId={requestId}/>)}
  <AppointmentPunchlist key={'punchlist:'+requestId} requestId={requestId}/>
  {at('contracts',<AppointmentContracts key={'contracts:'+requestId} requestId={requestId}/>)}
  {at('changes',<WorkChanges key={'changes:'+requestId} requestId={requestId} onStateChange={onChangeState}/>)}
  <AppointmentDelivery key={'delivery:'+requestId} requestId={requestId} onStateChange={onDeliveryState}/>
 </>;
}
