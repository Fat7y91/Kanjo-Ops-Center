begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Merchant legal / commercial-register identity.
 *
 * The contract document identifies the second party by its registered name,
 * commercial register, tax card, authorised representative and legal address.
 * Those values were previously left as handwriting rules on the printed
 * contract. Storing them on `app.merchants` lets the contract print bind real
 * data instead of blanks, and lets the draft editor pre-fill the party panel.
 *
 * Every column is `text not null default ''` so existing rows read as "not
 * captured yet" rather than null, and the row→domain mapper never has to
 * branch. Empty strings render as the contract fill rule, exactly like before.
 *
 * Re-runnable: guarded `add column if not exists`.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.merchants
  add column if not exists legal_name                          text not null default '',
  add column if not exists commercial_register_no              text not null default '',
  add column if not exists tax_card_no                         text not null default '',
  add column if not exists legal_representative_name           text not null default '',
  add column if not exists legal_representative_title          text not null default '',
  add column if not exists legal_representative_national_id    text not null default '',
  add column if not exists legal_address                       text not null default '';

comment on column app.merchants.legal_name is
  'Registered legal name printed as the second party; falls back to the trade name.';
comment on column app.merchants.commercial_register_no is
  'Commercial register number of the merchant entity.';
comment on column app.merchants.tax_card_no is
  'Tax registration card number of the merchant entity.';
comment on column app.merchants.legal_representative_name is
  'Authorised signatory printed in the second-party panel.';
comment on column app.merchants.legal_representative_title is
  'Role of the authorised signatory, e.g. owner or managing director.';
comment on column app.merchants.legal_representative_national_id is
  '14-digit national id of the authorised signatory.';
comment on column app.merchants.legal_address is
  'Registered legal address printed on the contract; falls back to the physical address.';

commit;
