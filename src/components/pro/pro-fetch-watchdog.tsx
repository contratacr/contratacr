'use client';
import {installProFetchWatchdog} from '@/lib/pro/fetch-watchdog';
// Installed synchronously on the client (module scope) so the first effects of
// the dashboard already read with a deadline; renders nothing.
if(typeof window!=='undefined')installProFetchWatchdog();
export function ProFetchWatchdog(){return null;}
