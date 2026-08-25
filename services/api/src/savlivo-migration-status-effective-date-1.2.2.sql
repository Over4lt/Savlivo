ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS status_effective_date date;
