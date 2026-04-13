type CameraSelectionFailureReason =
  | 'not-supported'
  | 'rear-camera-not-found'
  | 'safe-main-camera-not-found'

type CameraSelectionResult =
  | { ok: true; deviceId: string; label: string }
  | { ok: false; reason: CameraSelectionFailureReason }

const REAR_CAMERA_KEYWORDS = ['back', 'rear', 'environment', '\uD6C4\uBA74', '\uD6C4\uBC29']
const REJECTED_LENS_KEYWORDS = [
  'wide',
  'wide-angle',
  'wide angle',
  'ultra',
  'ultra-wide',
  'ultrawide',
  'tele',
  'telephoto',
  'periscope',
  'macro',
  'zoom',
  '\uAD11\uAC01',
  '\uCD08\uAD11\uAC01',
  '\uC6B8\uD2B8\uB77C',
  '\uB9DD\uC6D0',
  '\uB9E4\uD06C\uB85C',
  '\uC90C',
]
const PRIMARY_LENS_KEYWORDS = ['main', 'default', 'standard', 'normal', '1x', '1.0x', '1,0x', '\uAE30\uBCF8', '\uBA54\uC778', '\uD45C\uC900']
const GENERIC_REAR_CAMERA_LABELS = [
  'back camera',
  'rear camera',
  'back',
  'rear',
  'environment',
  '\uD6C4\uBA74 \uCE74\uBA54\uB77C',
  '\uD6C4\uBA74',
  '\uD6C4\uBC29 \uCE74\uBA54\uB77C',
]

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isRearCameraLabel(label: string) {
  return REAR_CAMERA_KEYWORDS.some((keyword) => label.includes(keyword))
}

function hasRejectedLensKeyword(label: string) {
  if (REJECTED_LENS_KEYWORDS.some((keyword) => label.includes(keyword))) {
    return true
  }

  return /\b(?:0(?:[.,](?:5|6))?|2(?:[.,]0)?|3(?:[.,]0)?|5(?:[.,]0)?|10(?:[.,]0)?)\s*(?:x|\u00d7)\b/.test(label)
}

function hasPrimaryLensKeyword(label: string) {
  if (PRIMARY_LENS_KEYWORDS.some((keyword) => label.includes(keyword))) {
    return true
  }

  return /\b1(?:[.,]0)?\s*(?:x|\u00d7)\b/.test(label)
}

function isGenericRearCameraLabel(label: string) {
  return GENERIC_REAR_CAMERA_LABELS.includes(label)
}

function isAndroidMainCameraSlotLabel(label: string) {
  return /camera\d*\s*0\b.*\b(back|rear)\b/.test(label) || /\b(back|rear)\b.*camera\d*\s*0\b/.test(label)
}

function pickStrictMainRearCamera(devices: MediaDeviceInfo[]) {
  const safeRearDevices = devices
    .filter((device) => device.kind === 'videoinput')
    .filter((device) => device.label.trim().length > 0)
    .map((device) => ({ device, normalizedLabel: normalizeLabel(device.label) }))
    .filter(({ normalizedLabel }) => isRearCameraLabel(normalizedLabel))
    .filter(({ normalizedLabel }) => !hasRejectedLensKeyword(normalizedLabel))

  if (safeRearDevices.length === 0) {
    return null
  }

  const primaryMatch = safeRearDevices.filter(({ normalizedLabel }) => hasPrimaryLensKeyword(normalizedLabel))
  if (primaryMatch.length === 1) {
    return primaryMatch[0].device
  }

  const genericRearMatch = safeRearDevices.filter(({ normalizedLabel }) => isGenericRearCameraLabel(normalizedLabel))
  if (genericRearMatch.length === 1) {
    return genericRearMatch[0].device
  }

  const androidMainSlotMatch = safeRearDevices.filter(({ normalizedLabel }) => isAndroidMainCameraSlotLabel(normalizedLabel))
  if (androidMainSlotMatch.length === 1) {
    return androidMainSlotMatch[0].device
  }

  if (safeRearDevices.length === 1) {
    return safeRearDevices[0].device
  }

  return null
}

async function unlockCameraLabelsIfNeeded(devices: MediaDeviceInfo[]) {
  const hasVideoLabels = devices.some((device) => device.kind === 'videoinput' && device.label.trim().length > 0)
  if (hasVideoLabels || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return devices
  }

  const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
  tempStream.getTracks().forEach((track) => track.stop())
  return navigator.mediaDevices.enumerateDevices()
}

export async function getStrictMainRearCamera(): Promise<CameraSelectionResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return { ok: false, reason: 'not-supported' }
  }

  let devices = await navigator.mediaDevices.enumerateDevices()
  let selectedDevice = pickStrictMainRearCamera(devices)

  if (!selectedDevice) {
    devices = await unlockCameraLabelsIfNeeded(devices)
    selectedDevice = pickStrictMainRearCamera(devices)
  }

  if (selectedDevice) {
    return { ok: true, deviceId: selectedDevice.deviceId, label: selectedDevice.label }
  }

  const rearCameraExists = devices
    .filter((device) => device.kind === 'videoinput')
    .some((device) => isRearCameraLabel(normalizeLabel(device.label)))

  return {
    ok: false,
    reason: rearCameraExists ? 'safe-main-camera-not-found' : 'rear-camera-not-found',
  }
}
