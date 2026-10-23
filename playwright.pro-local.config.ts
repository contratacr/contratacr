import base from './playwright.config';
import {defineConfig} from 'playwright/test';
// This suite creates its own disposable actors and only targets loopback Supabase.
export default defineConfig({...base,globalSetup:undefined,testMatch:'**/pro-*.spec.ts',workers:1});
