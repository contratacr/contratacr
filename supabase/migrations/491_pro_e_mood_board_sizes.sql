-- Pro area E (mood boards): more page sizes (4:3 presentation, US Letter, US Tabloid, A3, all landscape) next to 16:9 and A4.
-- The page_format check constraints and the two mutate functions list the allowed values inline, so both are widened in place:
-- constraints are found by definition (names were generated), and the function bodies are rewritten from their current definition.
begin;
do $$
declare c record;f record;def text;
begin
 for c in select con.conrelid::regclass::text tbl,con.conname cname from pg_constraint con
  where con.contype='c' and con.conrelid in('public.pro_mood_boards'::regclass,'public.pro_mood_board_publications'::regclass,'public.pro_mood_board_templates'::regclass)
   and pg_get_constraintdef(con.oid) like '%page_format%' loop
  execute format('alter table %s drop constraint %I',c.tbl,c.cname);
 end loop;
 alter table public.pro_mood_boards add constraint pro_mood_boards_page_format_chk check(page_format in('wide','a4','standard','letter','tabloid','a3'));
 alter table public.pro_mood_board_publications add constraint pro_mood_board_publications_page_format_chk check(page_format in('wide','a4','standard','letter','tabloid','a3'));
 alter table public.pro_mood_board_templates add constraint pro_mood_board_templates_page_format_chk check(page_format in('wide','a4','standard','letter','tabloid','a3'));
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_mood_boards_mutate','pro_mood_template_mutate') loop
  def:=pg_get_functiondef(f.oid);
  if position('(''wide'',''a4'')' in def)>0 then execute replace(def,'(''wide'',''a4'')','(''wide'',''a4'',''standard'',''letter'',''tabloid'',''a3'')');end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
