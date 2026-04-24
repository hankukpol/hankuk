import { z } from 'zod'

export const presenceBrowserContextSchema = z.enum(['kakao', 'safari', 'chrome', 'pwa', 'other'])

export const presenceLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(10_000),
  capturedAt: z.string().datetime(),
  source: z.literal('browser-geolocation'),
  browserContext: presenceBrowserContextSchema.optional(),
})

export const presenceErrorSchema = z.object({
  errorCode: z.enum([
    'unsupported',
    'permission_denied',
    'position_unavailable',
    'timeout',
    'policy_blocked',
    'not_mobile',
    'missing_location',
    'invalid_location',
    'stale_location',
    'low_accuracy',
    'outside_radius',
    'config_required',
  ]),
  message: z.string().max(300).optional(),
  browserContext: presenceBrowserContextSchema.optional(),
})
