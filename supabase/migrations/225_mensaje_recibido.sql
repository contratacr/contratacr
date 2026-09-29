-- «Recibido» (✓✓) entre «enviado» (✓) y «visto» (✓✓ resaltado), como WhatsApp.
--
-- Un mensaje queda RECIBIDO cuando la app de quien lo recibe carga sus
-- conversaciones —al abrirse, o al llegarle el mensaje en vivo—. No depende
-- del push: el teléfono no le avisa a la plataforma de que lo mostró. Quien no
-- tiene la app se queda en «enviado» hasta que entra, que es lo que de verdad
-- pasó.
alter table public.direct_messages
  add column if not exists delivered_at timestamptz;

-- Lo ya visto, por fuerza, también se recibió.
update public.direct_messages
set delivered_at = read_at
where delivered_at is null and read_at is not null;

notify pgrst, 'reload schema';
