alter table app.merchants
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

comment on column app.merchants.archived_at is
  'Set when a V1 merchant carried the manual "أرشيف" name marker and was imported as inactive.';
comment on column app.merchants.archive_reason is
  'Migration provenance for archived merchants; kept separate from contract_state.';
