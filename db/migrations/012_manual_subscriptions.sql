BEGIN;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS custom_service_name TEXT;
ALTER TABLE subscriptions ALTER COLUMN service_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_service_identity') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscription_service_identity CHECK (
      (service_id IS NOT NULL AND custom_service_name IS NULL) OR
      (service_id IS NULL AND custom_service_name IS NOT NULL AND length(btrim(custom_service_name)) BETWEEN 1 AND 100)
    );
  END IF;
END $$;
COMMIT;
