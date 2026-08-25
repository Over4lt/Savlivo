export type ReminderEligibilityInput = {
  status: string;
  renewalDate?: string | null;
  renewalRemindersEnabled: boolean;
  channel: "PUSH" | "EMAIL";
  emailEnabled?: boolean;
  pushEndpointEnabled?: boolean;
};

export function isReminderEligible(
  input: ReminderEligibilityInput
) {
  if (input.status !== "ACTIVE") {
    return false;
  }

  if (!input.renewalDate) {
    return false;
  }

  if (!input.renewalRemindersEnabled) {
    return false;
  }

  if (input.channel === "EMAIL") {
    return input.emailEnabled !== false;
  }

  return input.pushEndpointEnabled === true;
}

function timezoneOffsetMs(
  instant: Date,
  timeZone: string
) {
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }
  ).formatToParts(instant);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [
        part.type,
        Number(part.value)
      ])
  );

  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return asUtc - instant.getTime();
}

export function reminderInstantForRenewal(
  renewalDate: string,
  timeZone: string
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      renewalDate
    );

  if (!match) {
    throw new Error("INVALID_RENEWAL_DATE");
  }

  // Validate timezone before doing any conversion.
  new Intl.DateTimeFormat(
    "en-US",
    { timeZone }
  ).format(new Date());

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Reminder = 3 calendar days before renewal,
  // at 09:00 in the user's timezone.
  const localReminder = new Date(
    Date.UTC(
      year,
      month - 1,
      day - 3,
      9,
      0,
      0
    )
  );

  // Iteratively resolve local wall-clock time to UTC.
  let utcMs = localReminder.getTime();

  for (let i = 0; i < 3; i += 1) {
    const offset = timezoneOffsetMs(
      new Date(utcMs),
      timeZone
    );

    utcMs =
      localReminder.getTime() -
      offset;
  }

  return new Date(utcMs);
}
