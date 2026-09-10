BEGIN;
-- Availability-only identities. No prices, users, plans or billing data seeded.
INSERT INTO services (slug, name) VALUES
  ('rtl-plus', 'RTL+'),
  ('videoland', 'Videoland'),
  ('nintendo-switch-online', 'Nintendo Switch Online'),
  ('osn-plus', 'OSN+')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
