-- Account deletion must erase linked journeys, not turn them into guest history.
alter table public.app_journey_events drop constraint app_journey_events_viewer_user_id_fkey;
alter table public.app_journey_events add constraint app_journey_events_viewer_user_id_fkey
 foreign key(viewer_user_id) references public.profiles(id) on delete cascade;
-- Defence in depth: live administrator roles are excluded independently of JS/API.
create trigger skip_admin_analytics before insert or update on public.app_journey_events
 for each row execute function public.skip_admin_analytics();
