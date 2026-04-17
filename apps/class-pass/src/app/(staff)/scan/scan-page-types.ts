export type TabMode = 'qr' | 'quick'

export type ScanState = 'idle' | 'scanning' | 'processing' | 'selecting'

export type CourseItem = {
  id: number
  name: string
}

export type MaterialItem = {
  id: number
  name: string
  material_type?: 'handout' | 'textbook'
}

export type ScanResponse = {
  success: boolean
  reason?: string
  studentName?: string
  materialName?: string
  materialType?: 'handout' | 'textbook'
  needsSelection?: boolean
  unreceived?: MaterialItem[]
}

export type OverlayState = {
  success: boolean
  title: string
  description?: string
}

export type SessionResponse = {
  role: 'staff' | 'admin'
  division?: string
  adminId?: string
}

export type BootstrapResponse = {
  session: SessionResponse
  staffScanEnabled: boolean
  selectedCourseId: number | null
  courses: CourseItem[]
  materials: MaterialItem[]
}

export type QuickDistributionResponse = {
  success?: boolean
  student_name?: string
  material_name?: string
  material_type?: 'handout' | 'textbook'
  needsSelection?: boolean
  available_materials?: MaterialItem[]
  error?: string
}

export type ScannerInstance = {
  start: (
    cameraIdOrConfig: string | { facingMode: 'environment' | { exact: 'environment' } },
    config: { fps: number; qrbox: { width: number; height: number } },
    successCallback: (decodedText: string) => void | Promise<void>,
    errorCallback?: (errorMessage: string) => void,
  ) => Promise<unknown>
  stop: () => Promise<void>
  clear: () => void
}

export type LastScanState = {
  token: string
  at: number
}
