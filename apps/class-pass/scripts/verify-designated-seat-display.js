const assert = require('node:assert/strict')

const {
  DESIGNATED_SEAT_DISPLAY_HEARTBEAT_MS,
  DESIGNATED_SEAT_DISPLAY_MIN_REFRESH_MS,
  DESIGNATED_SEAT_DISPLAY_RETRY_MS,
  getDisplayRefreshDelay,
  getRotationExpiresAt,
  shouldUpdateDisplayHeartbeat,
} = require('../src/lib/designated-seat/display-runtime.js')

function testHeartbeatWindow() {
  const now = Date.parse('2026-04-12T00:00:00.000Z')

  assert.equal(shouldUpdateDisplayHeartbeat(null, now), true)
  assert.equal(shouldUpdateDisplayHeartbeat('invalid-date', now), true)
  assert.equal(
    shouldUpdateDisplayHeartbeat(new Date(now - DESIGNATED_SEAT_DISPLAY_HEARTBEAT_MS + 1).toISOString(), now),
    false,
  )
  assert.equal(
    shouldUpdateDisplayHeartbeat(new Date(now - DESIGNATED_SEAT_DISPLAY_HEARTBEAT_MS).toISOString(), now),
    true,
  )
}

function testRefreshDelayUsesLeadWindow() {
  const now = 30_000
  const refreshDelay = getDisplayRefreshDelay(new Date(now + 15_000).toISOString(), now)
  assert.equal(refreshDelay, 13_000)

  const nearExpiryDelay = getDisplayRefreshDelay(new Date(now + 400).toISOString(), now)
  assert.equal(nearExpiryDelay, DESIGNATED_SEAT_DISPLAY_MIN_REFRESH_MS)

  const invalidDelay = getDisplayRefreshDelay('not-a-date', now)
  assert.equal(invalidDelay, DESIGNATED_SEAT_DISPLAY_RETRY_MS)
}

function testRotationExpiryHelper() {
  assert.equal(getRotationExpiresAt(0), '1970-01-01T00:00:15.000Z')
  assert.equal(getRotationExpiresAt(4), '1970-01-01T00:01:15.000Z')
}

testHeartbeatWindow()
testRefreshDelayUsesLeadWindow()
testRotationExpiryHelper()

console.log('designated-seat display verification passed')
