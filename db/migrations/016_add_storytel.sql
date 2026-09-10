BEGIN;
INSERT INTO services (slug, name) VALUES ('storytel', 'Storytel')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
