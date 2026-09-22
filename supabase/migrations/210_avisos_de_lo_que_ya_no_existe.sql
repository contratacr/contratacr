-- AVISOS DE FUNCIONES QUE YA NO EXISTEN
--
-- Tres flujos salieron del producto —seguir profesionales, postularse a un
-- empleo y mandar propuestas a un proyecto— pero sus DISPARADORES de base
-- siguieron creados. Hoy no disparan solo porque nadie escribe ya en esas
-- tablas; cualquier escritura futura (una migracion de datos, un script de
-- administracion, una restauracion) los revive sin que nadie toque el codigo
-- del app.
--
-- Y uno de ellos SI esta molestando hoy: `publish_professional_activity` se
-- ejecuta cada vez que un profesional publica una promocion, publica un empleo
-- o edita su perfil, y le avisa a quien lo haya seguido ANTES de que se
-- retirara «seguir». Esas personas reciben avisos de una funcion que ya no
-- existe y que no pueden cancelar desde ninguna pantalla.
--
-- Se borran los disparadores, no los datos: las filas de seguidores, de
-- postulaciones y de propuestas se quedan, y los avisos que ya estan guardados
-- se siguen leyendo en la campana.

-- 1. Seguir un profesional: el aviso de «te siguio» y el de «publico algo».
drop trigger if exists trg_professional_follow_notification on public.professional_follows;
drop trigger if exists trg_capture_professional_profile_activity on public.professionals;
drop trigger if exists trg_capture_offer_activity on public.professional_offers;
drop trigger if exists trg_capture_job_activity on public.job_posts;

-- 2. Postularse a un empleo: se responde por WhatsApp desde hace tiempo.
drop trigger if exists trg_job_application_received_notification on public.job_applications;
drop trigger if exists trg_job_application_status_notification on public.job_applications;

-- 3. Propuestas a un proyecto: se retiraron; ahora se contacta por WhatsApp.
drop trigger if exists on_proposal_created on public.proposals;
drop trigger if exists on_proposal_accepted on public.proposals;
