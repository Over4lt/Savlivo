ALTER TABLE verified_provider_prices
  DROP CONSTRAINT
    verified_provider_prices_verification_check;

ALTER TABLE verified_provider_prices
  ADD CONSTRAINT
    verified_provider_prices_verification_check
  CHECK (
    verification IN (
      'registry',
      'multi-source',
      'authoritative-provider'
    )
  );
