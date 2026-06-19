-- Allow HALF-STAR review ratings (e.g. 4.5). Was `integer ... check (rating between 1 and 5)`.
-- Change the column to numeric(2,1) and constrain to 0.5-step increments in [0.5, 5].
alter table public.reviews
  alter column rating type numeric(2,1) using rating::numeric;

-- Drop the original inline check (Postgres named it <table>_<column>_check) and add
-- the half-step constraint.
alter table public.reviews drop constraint if exists reviews_rating_check;
alter table public.reviews
  add constraint reviews_rating_check
  check (rating >= 0.5 and rating <= 5 and (rating * 2) = floor(rating * 2));
