begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Private bucket for transaction receipts.
 *
 * A receipt (`receipt_no` + file) proves a settlement. Files are uploaded by
 * the server after admission checks, stored privately, and read through a
 * short-lived signed URL — the same discipline as `capital-receipts`.
 *
 * Supabase-only: a stock PostgreSQL has no `storage` schema, so the statement
 * is guarded.
 * ───────────────────────────────────────────────────────────────────────── */

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('transaction-receipts', 'transaction-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update
      set public             = excluded.public,
          file_size_limit    = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

commit;
