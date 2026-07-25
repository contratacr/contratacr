-- The default public search filters rejected/banned rows and sorts by trust,
-- rating and recency. Keep that hot path in one compact partial index.
create index if not exists professionals_public_search_order_idx
  on public.professionals (
    is_verified desc,
    is_featured desc,
    rating_avg desc,
    review_count desc,
    created_at desc
  )
  where is_banned = false
    and verification_status <> 'rejected';
