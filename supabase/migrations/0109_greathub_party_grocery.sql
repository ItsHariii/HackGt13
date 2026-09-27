-- GreatHub departments for the party and grocery packs (rule-packs party.ts, grocery.ts).
-- Fictional brands only (SDD §16); the rows themselves are in seed.sql.
alter table greathub.products drop constraint products_department_check;
alter table greathub.products add constraint products_department_check
  check (department in ('home_office', 'apparel', 'travel', 'grocery', 'party'));
