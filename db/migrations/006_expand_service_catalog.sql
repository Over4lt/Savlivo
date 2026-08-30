BEGIN;

INSERT INTO services (slug, name) VALUES

  -- Video
  ('netflix', 'Netflix'),
  ('disney-plus', 'Disney+'),
  ('max', 'Max'),
  ('prime-video', 'Prime Video'),
  ('amazon-prime', 'Amazon Prime'),
  ('apple-tv-plus', 'Apple TV+'),
  ('youtube-premium', 'YouTube Premium'),
  ('hulu', 'Hulu'),
  ('paramount-plus', 'Paramount+'),
  ('peacock', 'Peacock'),
  ('crunchyroll', 'Crunchyroll'),

  -- Music & audio
  ('spotify', 'Spotify'),
  ('apple-music', 'Apple Music'),
  ('amazon-music-unlimited', 'Amazon Music Unlimited'),
  ('tidal', 'TIDAL'),
  ('audible', 'Audible'),

  -- Gaming
  ('xbox-game-pass', 'Xbox Game Pass'),
  ('playstation-plus', 'PlayStation Plus'),
  ('ea-play', 'EA Play'),
  ('ubisoft-plus', 'Ubisoft+'),
  ('geforce-now', 'GeForce NOW'),

  -- AI, software & cloud
  ('chatgpt', 'ChatGPT'),
  ('claude', 'Claude'),
  ('microsoft-365', 'Microsoft 365'),
  ('adobe-creative-cloud', 'Adobe Creative Cloud'),
  ('canva', 'Canva'),
  ('dropbox', 'Dropbox'),
  ('google-one', 'Google One'),
  ('icloud-plus', 'iCloud+'),

  -- Fitness & wellness
  ('strava', 'Strava'),
  ('calm', 'Calm'),
  ('headspace', 'Headspace')

ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name;


INSERT INTO billing_providers (
  slug,
  name,
  provider_type
) VALUES
  ('direct', 'Direct billing', 'DIRECT'),
  ('apple', 'Apple', 'PLATFORM'),
  ('google-play', 'Google Play', 'PLATFORM'),
  ('amazon', 'Amazon', 'PLATFORM'),
  ('carrier', 'Carrier / TV provider', 'PARTNER')

ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type;

COMMIT;
