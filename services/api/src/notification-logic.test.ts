import assert from "node:assert/strict";
import test from "node:test";

import {
  isReminderEligible,
  reminderInstantForRenewal
} from "./notification-logic.js";

test(
  "active push reminder with enabled endpoint is eligible",
  () => {
    assert.equal(
      isReminderEligible({
        status: "ACTIVE",
        renewalDate: "2026-09-10",
        renewalRemindersEnabled: true,
        channel: "PUSH",
        pushEndpointEnabled: true
      }),
      true
    );
  }
);

test(
  "inactive subscription is not eligible",
  () => {
    assert.equal(
      isReminderEligible({
        status: "PAUSED",
        renewalDate: "2026-09-10",
        renewalRemindersEnabled: true,
        channel: "PUSH",
        pushEndpointEnabled: true
      }),
      false
    );
  }
);

test(
  "disabled renewal reminders suppress delivery",
  () => {
    assert.equal(
      isReminderEligible({
        status: "ACTIVE",
        renewalDate: "2026-09-10",
        renewalRemindersEnabled: false,
        channel: "EMAIL",
        emailEnabled: true
      }),
      false
    );
  }
);

test(
  "disabled email suppresses email reminder",
  () => {
    assert.equal(
      isReminderEligible({
        status: "ACTIVE",
        renewalDate: "2026-09-10",
        renewalRemindersEnabled: true,
        channel: "EMAIL",
        emailEnabled: false
      }),
      false
    );
  }
);

test(
  "disabled push endpoint suppresses push reminder",
  () => {
    assert.equal(
      isReminderEligible({
        status: "ACTIVE",
        renewalDate: "2026-09-10",
        renewalRemindersEnabled: true,
        channel: "PUSH",
        pushEndpointEnabled: false
      }),
      false
    );
  }
);

test(
  "Oslo winter reminder is 09:00 local",
  () => {
    const reminder =
      reminderInstantForRenewal(
        "2026-12-10",
        "Europe/Oslo"
      );

    // Dec 7 09:00 CET = 08:00 UTC
    assert.equal(
      reminder.toISOString(),
      "2026-12-07T08:00:00.000Z"
    );
  }
);

test(
  "Oslo summer reminder respects DST",
  () => {
    const reminder =
      reminderInstantForRenewal(
        "2026-07-10",
        "Europe/Oslo"
      );

    // Jul 7 09:00 CEST = 07:00 UTC
    assert.equal(
      reminder.toISOString(),
      "2026-07-07T07:00:00.000Z"
    );
  }
);

test(
  "calendar-day subtraction survives DST transition",
  () => {
    const reminder =
      reminderInstantForRenewal(
        "2026-03-31",
        "Europe/Oslo"
      );

    // Renewal Mar 31 -> reminder Mar 28.
    // Mar 28 is still CET in 2026, so 09:00 = 08:00 UTC.
    assert.equal(
      reminder.toISOString(),
      "2026-03-28T08:00:00.000Z"
    );
  }
);

test(
  "invalid renewal date is rejected",
  () => {
    assert.throws(
      () =>
        reminderInstantForRenewal(
          "10-09-2026",
          "Europe/Oslo"
        ),
      /INVALID_RENEWAL_DATE/
    );
  }
);

test(
  "invalid timezone is rejected",
  () => {
    assert.throws(
      () =>
        reminderInstantForRenewal(
          "2026-09-10",
          "Mars/Olympus"
        )
    );
  }
);
