BEGIN;

CREATE TABLE IF NOT EXISTS research_service_identities (
  research_service_id TEXT PRIMARY KEY,
  canonical_slug TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RESEARCHABLE','AMBIGUOUS','DEACTIVATED')),
  provider_host TEXT NOT NULL,
  provider_binding_digest TEXT NOT NULL,
  provider_binding JSONB NOT NULL,
  provider_observation TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_body_sha256 TEXT NOT NULL,
  source_body TEXT NOT NULL,
  identity_locator JSONB NOT NULL,
  subscription_locator JSONB NOT NULL,
  relationship TEXT NOT NULL,
  extraction_mechanism TEXT NOT NULL,
  admission_version INTEGER NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(aliases)='array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_service_identities_normalized_name_idx
ON research_service_identities(normalized_name);

COMMIT;
