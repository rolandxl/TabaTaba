export type FollowSensitivity = 'careful' | 'balanced' | 'responsive'

export const FOLLOW_SENSITIVITIES: readonly FollowSensitivity[] = [
  'careful',
  'balanced',
  'responsive',
]

export const DEFAULT_FOLLOW_SENSITIVITY: FollowSensitivity = 'balanced'

export function isFollowSensitivity(value: unknown): value is FollowSensitivity {
  return (
    value === 'careful' || value === 'balanced' || value === 'responsive'
  )
}

export interface Song {
  id: string
  title: string
  artist: string
  tags: string[]
  key: string
  capo: number
  content: string
  transpose: number
  favorite: boolean
  createdAt: number
  updatedAt: number
  fontSize?: number
  scrollSpeed?: number
  followSensitivity?: FollowSensitivity
}

export interface Setlist {
  id: string
  name: string
  songIds: string[]
  createdAt: number
  updatedAt: number
}

export type Theme = 'dark' | 'light' | 'system'

export interface MicCalibration {
  noiseFloor: number
  threshold: number
  a4: number
  profiles: Record<string, number[]>
  lastCalibratedAt: number | null
}

export const DEFAULT_MIC_CALIBRATION: MicCalibration = {
  noiseFloor: 0.0015,
  threshold: 0.005,
  a4: 440,
  profiles: {},
  lastCalibratedAt: null,
}

export interface AppSettings {
  id: 'app'
  theme: Theme
  fontSize: number
  scrollSpeed: number
  lastBackupAt: number | null
  seeded: boolean
  calibrationMode: boolean
  mic: MicCalibration
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'dark',
  fontSize: 17,
  scrollSpeed: 24,
  lastBackupAt: null,
  seeded: false,
  calibrationMode: true,
  mic: DEFAULT_MIC_CALIBRATION,
}

export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 30
export const MIN_SCROLL_SPEED = 5
export const MAX_SCROLL_SPEED = 120
