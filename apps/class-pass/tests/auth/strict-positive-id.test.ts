import assert from 'node:assert/strict'
import { it } from 'node:test'
import { parsePositiveInt } from '../../src/lib/utils'

it('accepts canonical decimal IDs and existing positive integer number callers', () => {
  for (const [input, expected] of [
    ['1', 1], ['42', 42], ['9007199254740991', 9007199254740991],
    [1, 1], [42, 42], [9007199254740991, 9007199254740991],
  ] as const) {
    assert.equal(parsePositiveInt(input), expected)
  }
})

for (const input of [
  '1.0', '1e2', '0x10', '0b10', '+1', '01', ' 1', '1 ', '1\n',
  '9007199254740992', '', '0', '-1', '1.5', 'NaN', 'Infinity', '１',
  null, undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 9007199254740992,
]) {
  it(`rejects noncanonical or unsafe IDs: ${String(input)}`, () => {
    assert.equal(parsePositiveInt(input), null)
  })
}

it('does not coerce booleans, arrays, or objects into IDs', () => {
  for (const input of [true, false, [1], { valueOf: () => 1 }, BigInt(1)]) {
    assert.equal(parsePositiveInt(input as unknown as string), null)
  }
})
