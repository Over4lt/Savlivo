BEGIN;
INSERT INTO services (slug, name) VALUES ('viaplay', 'Viaplay')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
