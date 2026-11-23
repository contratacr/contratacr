-- Pro family 60 (clipper): capture from the owner's own browser. A bookmarklet or the extension reads the Open Graph / schema.org data
-- the browser already shows and hands it to the app; the clip is stored with source 'bookmarklet' and mode 'browser' (no server read).
-- Only widens the two check constraints of pro_catalog_clips (migration 307); everything else stays as is. Idempotent.
begin;
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.pro_catalog_clips'::regclass and contype='c'
  and (pg_get_constraintdef(oid) like '%source%app%extension%' or pg_get_constraintdef(oid) like '%mode%mock%sandbox%production%') and pg_get_constraintdef(oid) not like '%bookmarklet%' and pg_get_constraintdef(oid) not like '%browser%' loop
  execute format('alter table public.pro_catalog_clips drop constraint %I',c.conname);
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.pro_catalog_clips'::regclass and conname='pro_catalog_clips_source_check2') then
  alter table public.pro_catalog_clips add constraint pro_catalog_clips_source_check2 check(source in('app','extension','bookmarklet'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.pro_catalog_clips'::regclass and conname='pro_catalog_clips_mode_check2') then
  alter table public.pro_catalog_clips add constraint pro_catalog_clips_mode_check2 check(mode in('mock','sandbox','production','browser'));
 end if;
end $$;
notify pgrst,'reload schema';
commit;
