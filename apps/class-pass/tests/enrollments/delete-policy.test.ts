import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getEnrollmentDeleteDecision } from '../../src/lib/enrollment-delete-policy'

describe('getEnrollmentDeleteDecision', () => {
  it('allows deletion when there are no payment rows', () => {
    const decision = getEnrollmentDeleteDecision([])

    assert.equal(decision.canDelete, true)
    assert.equal(decision.paymentRowCount, 0)
    assert.equal(decision.positivePaymentCount, 0)
    assert.equal(decision.zeroAmountPaymentCount, 0)
  })

  it('blocks deletion when a 0 won payment row exists', () => {
    const decision = getEnrollmentDeleteDecision([
      { id: 10, amount: 0, method: 'free', status: 'paid' },
      { id: 11, amount: 0, method: 'free', status: 'voided' },
    ])

    assert.equal(decision.canDelete, false)
    assert.equal(decision.paymentRowCount, 2)
    assert.equal(decision.positivePaymentCount, 0)
    assert.equal(decision.zeroAmountPaymentCount, 2)
  })

  it('blocks deletion when a paid payment exists', () => {
    const decision = getEnrollmentDeleteDecision([
      { id: 10, amount: 0, method: 'free', status: 'paid' },
      { id: 12, amount: 50000, method: 'card', status: 'paid' },
    ])

    assert.equal(decision.canDelete, false)
    assert.equal(decision.paymentRowCount, 2)
    assert.equal(decision.positivePaymentCount, 1)
    assert.equal(decision.zeroAmountPaymentCount, 1)
  })

  it('blocks deletion even when a positive payment was voided or refunded', () => {
    const decision = getEnrollmentDeleteDecision([
      { id: 20, amount: 30000, method: 'card', status: 'voided' },
      { id: 21, amount: 40000, method: 'cash', status: 'fully_refunded' },
    ])

    assert.equal(decision.canDelete, false)
    assert.equal(decision.paymentRowCount, 2)
    assert.equal(decision.positivePaymentCount, 2)
    assert.equal(decision.zeroAmountPaymentCount, 0)
  })
})
