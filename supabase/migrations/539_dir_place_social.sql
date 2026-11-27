-- 539 (Pro, 2026-11-27, owner request «también deberían de salir los iconos de las redes sociales»).
-- * `social` attribute on every place section: the place's social links as {network: https URL} (facebook, instagram,
--   tiktok, x, youtube, linkedin). Filled from the OSM contact:* tags at import (scripts/directory/osm-social.mjs) or by
--   the team/owner; validated by zod (src/lib/directory/place-social.ts: https, the network's own host only) and shown
--   as icon links on /lugar/<slug>. Without this key dir_attributes_ok would reject (or the importer drop) the whole
--   attributes object of a row that carries it. No data is written here.
begin;
update public.dir_verticals set attribute_keys=attribute_keys||array['social'] where not('social'=any(attribute_keys));
commit;
