-- Internal activity publication is invoked by trusted database triggers.
-- Keep it unavailable as a client-callable SECURITY DEFINER RPC.
revoke all on function public.publish_professional_activity(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.publish_professional_activity(uuid, text, text, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
