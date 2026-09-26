-- Storage buckets (SDD §11.3, §15, §19.4).
--   sources/{sha256}.{ext}               private; raw source snapshots, written and read by the server
--   evidence-packs/{user_id}/{order}.zip  private; served through short-lived signed URLs
--   product-images/…                      public read
-- Writes to every bucket go through the server's secret key, which bypasses storage RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('sources', 'sources', false, 10485760, null),
  ('evidence-packs', 'evidence-packs', false, 52428800, array['application/zip']),
  ('product-images', 'product-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_read on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');

-- An owner may read their own packs directly (the app still prefers signed URLs).
create policy evidence_packs_owner_read on storage.objects for select to authenticated
using (bucket_id = 'evidence-packs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No client policies on `sources`: snapshots are rendered through the server's sanitizing view.
