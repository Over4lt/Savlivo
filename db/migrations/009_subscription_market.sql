ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

UPDATE subscriptions
SET country_code = CASE currency
  WHEN 'USD' THEN 'US'
  WHEN 'NOK' THEN 'NO'
  WHEN 'SEK' THEN 'SE'
  WHEN 'DKK' THEN 'DK'
  WHEN 'CNY' THEN 'CN'
  ELSE country_code
END
WHERE country_code IS NULL;
