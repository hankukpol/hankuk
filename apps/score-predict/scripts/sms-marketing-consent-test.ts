import assert from "node:assert/strict";
import {
  buildSmsMarketingConsentUpdate,
  isSmsMarketingConsentActive,
  SMS_MARKETING_CONSENT_VERSION,
} from "../src/lib/police/sms-marketing-consent";

const firstConsentAt = new Date("2026-08-08T00:00:00.000Z");
const later = new Date("2026-08-09T00:00:00.000Z");

const neverConsented = {
  smsMarketingConsentAt: null,
  smsMarketingConsentVersion: null,
  smsMarketingConsentWithdrawnAt: null,
};
const firstConsent = buildSmsMarketingConsentUpdate(neverConsented, true, firstConsentAt);
assert.deepEqual(firstConsent, {
  smsMarketingConsentAt: firstConsentAt,
  smsMarketingConsentVersion: SMS_MARKETING_CONSENT_VERSION,
  smsMarketingConsentWithdrawnAt: null,
});

const activeConsent = {
  smsMarketingConsentAt: firstConsentAt,
  smsMarketingConsentVersion: SMS_MARKETING_CONSENT_VERSION,
  smsMarketingConsentWithdrawnAt: null,
};
assert.equal(isSmsMarketingConsentActive(activeConsent), true);
assert.equal(
  buildSmsMarketingConsentUpdate(activeConsent, true, later),
  null,
  "Saving pre-registration again must preserve the original consent timestamp."
);

const withdrawal = buildSmsMarketingConsentUpdate(activeConsent, false, later);
assert.deepEqual(withdrawal, { smsMarketingConsentWithdrawnAt: later });

const withdrawnConsent = {
  ...activeConsent,
  smsMarketingConsentWithdrawnAt: later,
};
assert.equal(isSmsMarketingConsentActive(withdrawnConsent), false);
assert.equal(buildSmsMarketingConsentUpdate(withdrawnConsent, false, later), null);

const renewedAt = new Date("2026-08-10T00:00:00.000Z");
assert.deepEqual(buildSmsMarketingConsentUpdate(withdrawnConsent, true, renewedAt), {
  smsMarketingConsentAt: renewedAt,
  smsMarketingConsentVersion: SMS_MARKETING_CONSENT_VERSION,
  smsMarketingConsentWithdrawnAt: null,
});

console.log(JSON.stringify({ smsMarketingConsent: "passed" }, null, 2));
