-- Repair the confirmed legacy replacement-character corruption at rest.
-- Runtime boundaries also repair known legacy text so older rows in other
-- user-generated fields remain readable without broad, ambiguous rewrites.
update public.profiles
set full_name = replace(full_name, 'Ure?a', 'Ureña')
where full_name like '%Ure?a%';

update public.professionals
set business_name = replace(business_name, 'Ure?a', 'Ureña')
where business_name like '%Ure?a%';
