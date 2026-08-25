-- Normalize existing renewal timestamps to noon on their existing calendar date.
-- This prevents timezone conversion from moving a renewal to the previous day.
UPDATE subscriptions
SET renewal_date =
  CASE
    WHEN renewal_date IS NULL THEN NULL
    ELSE renewal_date::date + time '12:00:00'
  END;
