-- Test-only schema proposal. Intentionally absent from production-migrations.ts.
-- Installing this in production requires a separate migration review and approval.
CREATE TABLE retained_verified_target_revisions (
  service_slug text NOT NULL,
  country_code char(2) NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  PRIMARY KEY (service_slug,country_code)
);

CREATE FUNCTION bump_retained_verified_target_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO retained_verified_target_revisions(service_slug,country_code,revision)
    VALUES(OLD.service_slug,OLD.country_code,1)
    ON CONFLICT(service_slug,country_code) DO UPDATE
      SET revision=retained_verified_target_revisions.revision+1;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND
      (OLD.service_slug,OLD.country_code) IS DISTINCT FROM (NEW.service_slug,NEW.country_code)) THEN
    INSERT INTO retained_verified_target_revisions(service_slug,country_code,revision)
    VALUES(NEW.service_slug,NEW.country_code,1)
    ON CONFLICT(service_slug,country_code) DO UPDATE
      SET revision=retained_verified_target_revisions.revision+1;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE TRIGGER retained_verified_current_revision
AFTER INSERT OR UPDATE OR DELETE ON verified_provider_prices
FOR EACH ROW EXECUTE FUNCTION bump_retained_verified_target_revision();
CREATE TRIGGER retained_verified_history_revision
AFTER INSERT OR UPDATE OR DELETE ON verified_price_observations
FOR EACH ROW EXECUTE FUNCTION bump_retained_verified_target_revision();

CREATE TABLE retained_verified_admissions (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL,
  target_id text NOT NULL,
  service_slug text NOT NULL,
  country_code char(2) NOT NULL,
  attempt_id text NOT NULL,
  source_url text NOT NULL,
  body_sha256 char(64) NOT NULL,
  journal_sequence integer NOT NULL,
  journal_hash char(64) NOT NULL,
  approved_digest char(64) NOT NULL,
  approval_nonce uuid NOT NULL UNIQUE,
  operator_id uuid NOT NULL,
  approval_signature text NOT NULL,
  policy_revision text NOT NULL,
  parser_truth_version char(64) NOT NULL,
  source_acquired_at timestamptz NOT NULL,
  admitted_at timestamptz NOT NULL,
  prior_revision bigint NOT NULL,
  resulting_revision bigint NOT NULL,
  result_digest char(64) NOT NULL,
  result jsonb NOT NULL,
  UNIQUE(job_id,target_id,attempt_id,body_sha256)
);
