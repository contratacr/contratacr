-- 046_call_phone.sql
-- Optional SEPARATE phone number for CALLS (some pros use a different number for
-- calls vs WhatsApp). When null, the WhatsApp number is used for calls too.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS call_phone text;

NOTIFY pgrst, 'reload schema';
