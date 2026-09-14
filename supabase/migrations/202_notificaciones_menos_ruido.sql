-- Menos ruido en las notificaciones, con tres cambios medidos.
--
-- 1. DIEZ MENSAJES SEGUIDOS ERAN DIEZ AVISOS. El aviso de mensaje directo se
--    insertaba uno por mensaje, sin mirar si ya había uno sin leer de esa misma
--    conversación. El correo sí tenía esa regla desde hace meses (solo avisa
--    cuando no hay nada pendiente); ahora la campana hace lo mismo: si ya hay un
--    aviso sin leer de la conversación, se ACTUALIZA con el último mensaje y
--    sube al tope, en vez de apilar otro. El teléfono también deja de recibir
--    uno por mensaje, porque el push sale de esta misma fila.
--
-- 2. RETIRAR TU PROPIA POSTULACIÓN TE AVISABA A VOS. El disparador de estado no
--    miraba quién hacía el cambio, así que al retirarse llegaba un aviso y un
--    push diciendo "tu postulación fue retirada".
--
-- 3. NADIE SE ENTERABA DE QUE LA CONTRAPARTE BORRÓ SU CUENTA. El tipo
--    `counterparty_account_deleted` no estaba en la lista permitida: la
--    inserción fallaba y el código lo degradaba a un aviso en el registro.

-- ── 1. Un aviso por conversación mientras no se lea ─────────────────────────
create or replace function public.notify_direct_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_conversation public.direct_conversations%rowtype;
  v_receiver_id uuid;
  v_resumen text;
  v_pendiente uuid;
begin
  select * into v_conversation
  from public.direct_conversations
  where id = new.conversation_id;

  if not found then
    return new;
  end if;

  v_receiver_id := case
    when new.sender_id = v_conversation.client_id then v_conversation.professional_profile_id
    else v_conversation.client_id
  end;

  v_resumen := case
    when char_length(new.body) > 96 then left(new.body, 96) || '...'
    else new.body
  end;

  -- ¿Ya hay un aviso SIN LEER de esta misma conversación? Entonces se pone al
  -- día en vez de apilar otro.
  select n.id into v_pendiente
  from public.notifications as n
  where n.user_id = v_receiver_id
    and n.type = 'direct_message'
    and n.read = false
    and n.data->>'conversation_id' = new.conversation_id::text
  order by n.created_at desc
  limit 1;

  if v_pendiente is not null then
    update public.notifications
    set message = v_resumen,
        created_at = now()
    where id = v_pendiente;
    return new;
  end if;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_receiver_id,
    'direct_message',
    'Nuevo mensaje',
    v_resumen,
    jsonb_build_object(
      'link', '/es/mensajes?conversation=' || new.conversation_id,
      'conversation_id', new.conversation_id,
      'booking_id', v_conversation.booking_id,
      'project_id', v_conversation.project_id
    )
  );

  return new;
end;
$$;

-- ── 2. Retirarse no se avisa a uno mismo ────────────────────────────────────
create or replace function public.notify_job_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_title text;
  v_status_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Retirar la propia postulación es una acción del postulante: avisarle a él
  -- mismo de lo que acaba de hacer sobra.
  if new.status = 'withdrawn' then
    return new;
  end if;

  select title into v_job_title from public.job_posts where id = new.job_id;

  v_status_label := case new.status
    when 'accepted' then 'fue aceptada'
    when 'rejected' then 'no fue seleccionada'
    when 'reviewed' then 'fue revisada'
    else 'fue actualizada'
  end;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    new.applicant_id,
    'job_application_status',
    'Actualización de postulación',
    'Tu postulación a ' || coalesce(v_job_title, 'este empleo') || ' ' || v_status_label || '.',
    jsonb_build_object(
      'link', '/empleos?job=' || new.job_id::text,
      'job_id', new.job_id,
      'application_id', new.id,
      'status', new.status
    )
  );

  return new;
end;
$$;

-- ── 3. El aviso de cuenta borrada por fin cabe en la tabla ──────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'review_request','review_received','booking_received','booking_confirmed','booking_completed',
    'booking_completed_by_client','booking_cancelled','booking_cancelled_by_client',
    'booking_rescheduled','booking_update','proposal_received','proposal_withdrawn',
    'proposal_accepted','project_proposal_declined','proposal_updated','new_project',
    'project_proposal_accepted','project_work_done','project_completed','project_cancelled',
    'project_deleted','support_reply','verification','verification_approved',
    'verification_rejected','verification_appeal_received','verification_reverted',
    'verification_pending','suggestion_approved','suggestion_rejected','direct_message',
    'professional_follow','followed_professional_activity','job_application','job_application_status',
    'verification_outreach','project_professional_withdrew',
    'project_proposals_waiting','booking_pending_reminder','project_in_progress_idle',
    'project_confirmation_pending','booking_past_date_idle',
    'quote_sent','quote_accepted','quote_declined','pricing_request',
    'counterparty_account_deleted'
  ));

notify pgrst, 'reload schema';
