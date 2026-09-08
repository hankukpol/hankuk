import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrency, formatPaymentMonth, getPaymentMethodLabel, parseStoredPaymentMethod, normalizePaymentMethodValue, serializePaymentMethodValue, formatPaymentMethod } from "../../lib/payment-meta";

test("currency and payment-month display preserve signs, zero and unfamiliar legacy text", () => {
  assert.equal(formatCurrency(1234567), "1,234,567");
  assert.equal(formatCurrency(-320000), "-320,000");
  assert.equal(formatCurrency(0), "0");
  assert.equal(formatPaymentMonth("2026-09"), "2026년 9월");
  assert.equal(formatPaymentMonth("수시 납부"), "수시 납부");
  assert.equal(formatPaymentMonth(""), "");
});

for (const [stored, normalized, label] of [[" CARD ", "card", "카드"], ["카드", "card", "카드"], ["현금", "cash", "현금"], ["CASH", "cash", "현금"], ["bank transfer", "bank-transfer", "계좌이체"], ["account-transfer", "bank-transfer", "계좌이체"], ["account transfer", "bank-transfer", "계좌이체"], ["계좌이체", "bank-transfer", "계좌이체"], ["포인트", "point", "포인트"], ["기타", "other", "기타"]] as const) {
  test(`stored payment method ${stored.trim()} normalizes to ${normalized}`, () => {
    assert.deepEqual(parseStoredPaymentMethod(stored), { value: normalized, customLabel: null });
    assert.equal(normalizePaymentMethodValue(stored), normalized);
    assert.equal(serializePaymentMethodValue(stored), normalized);
    assert.equal(formatPaymentMethod(stored), label);
    assert.equal(getPaymentMethodLabel(normalized), label);
  });
}

test("missing payment method stays unset and displays an explicit unrecorded label", () => {
  for (const value of [undefined, null, "", "  "]) {
    assert.equal(parseStoredPaymentMethod(value), null);
    assert.equal(normalizePaymentMethodValue(value), null);
    assert.equal(serializePaymentMethodValue(value), null);
    assert.equal(formatPaymentMethod(value), "방법 미기록");
  }
});

test("unknown legacy methods become custom labels without losing their original wording", () => {
  assert.deepEqual(parseStoredPaymentMethod(" 지역화폐 "), { value: "other", customLabel: "지역화폐" });
  assert.equal(serializePaymentMethodValue("지역화폐"), "other:지역화폐");
  assert.equal(formatPaymentMethod("지역화폐"), "기타 (지역화폐)");
  assert.deepEqual(parseStoredPaymentMethod(" OTHER: 지역화폐 "), { value: "other", customLabel: "지역화폐" });
  assert.equal(formatPaymentMethod("other:"), "기타");
});

test("serialization replaces or explicitly clears custom details and ignores detail for known methods", () => {
  assert.equal(serializePaymentMethodValue("other:구 방식", " 새 방식 "), "other:새 방식");
  assert.equal(serializePaymentMethodValue("other:구 방식", ""), "other");
  assert.equal(serializePaymentMethodValue("cash", "불필요"), "cash");
  assert.equal(serializePaymentMethodValue("other:현장 결제", null), "other:현장 결제");
  const serialized = serializePaymentMethodValue("other", "지역화폐");
  assert.equal(serializePaymentMethodValue(serialized), serialized);
  assert.deepEqual(parseStoredPaymentMethod(serialized), { value: "other", customLabel: "지역화폐" });
});
