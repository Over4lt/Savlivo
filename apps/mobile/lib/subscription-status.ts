export type SubscriptionStatus =
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED";

export function effectiveSubscriptionStatus(args: {
  status?: string | null;
  statusEffectiveDate?: string | null;
  todayDateOnly: string;
}): SubscriptionStatus {
  const status = String(
    args.status ?? "ACTIVE"
  ).toUpperCase() as SubscriptionStatus;

  if (status === "ACTIVE") {
    return "ACTIVE";
  }

  const effectiveDate =
    args.statusEffectiveDate?.slice(0, 10) ?? "";

  if (
    effectiveDate &&
    effectiveDate > args.todayDateOnly
  ) {
    return "ACTIVE";
  }

  return status;
}
