type SubscriptionRenewalInput = {
  status?: string | null;
  statusEffectiveDate?: string | null;
  renewalDate?: string | null;
};

export function willSubscriptionRenewOn(
  input: SubscriptionRenewalInput
) {
  const status = String(
    input.status ?? "ACTIVE"
  ).toUpperCase();

  const renewalDate =
    input.renewalDate?.slice(0, 10) ?? "";

  if (!renewalDate) {
    return false;
  }

  if (status === "ACTIVE") {
    return true;
  }

  if (
    status !== "PAUSED" &&
    status !== "CANCELLED"
  ) {
    return false;
  }

  const effectiveDate =
    input.statusEffectiveDate?.slice(0, 10) ?? "";

  if (!effectiveDate) {
    return false;
  }

  return effectiveDate > renewalDate;
}

export function needsRenewalDateRefresh(args: {
  status?: string | null;
  statusEffectiveDate?: string | null;
  renewalDate?: string | null;
  todayDateOnly: string;
}) {
  const renewalDate =
    args.renewalDate?.slice(0, 10) ?? "";

  if (!renewalDate) {
    return false;
  }

  const status = String(
    args.status ?? "ACTIVE"
  ).toUpperCase();

  const effectiveDate =
    args.statusEffectiveDate?.slice(0, 10) ?? "";

  const effectivelyActiveToday =
    status === "ACTIVE" ||
    (
      (status === "PAUSED" || status === "CANCELLED") &&
      Boolean(effectiveDate) &&
      effectiveDate > args.todayDateOnly
    );

  return (
    effectivelyActiveToday &&
    renewalDate < args.todayDateOnly
  );
}
