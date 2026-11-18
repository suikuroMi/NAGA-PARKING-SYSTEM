export type Category = 'Motorcycle' | 'Car' | 'Van' | 'Other'
export const CATEGORIES: Category[] = ['Motorcycle', 'Car', 'Van', 'Other']

export type SlotStatus = 'available' | 'occupied' | 'reserved' | 'unavailable' | 'claimed'

export interface Slot {
  id: string // e.g. A02
  block: string
  number: number
  category: Category
  status: SlotStatus
  reason: string
  ticketId?: string
}

export type DigitalProvider = 'GCash' | 'Maya'
export const PROVIDERS: DigitalProvider[] = ['GCash', 'Maya']

export interface Payment {
  amount: number
  method: 'Cash' | 'Digital'
  tender: number
  change: number
  provider?: DigitalProvider
  reference?: string
  lostTicketFee?: number
  attendant: string
  paidAt: number
  transactionId: string
}

export interface Session {
  ticketId: string
  category: Category
  slotId: string
  entry: number
  rateVersion: string
  rate: Rate
  grace: number
  status: 'active' | 'completed' | 'closed'
  exit?: number
  payment?: Payment
  /** Set when an administrator ended the session without payment. */
  closure?: Correction & { uncollected: number; minutes: number }
}

export interface Transaction {
  id: string
  ticketId: string
  category: Category
  slotId: string
  entry: number
  exit: number
  /** Actual server confirmation time; absent on older records. */
  paidAt?: number
  minutes: number
  amount: number
  method: 'Cash' | 'Digital'
  tender: number
  change: number
  provider?: DigitalProvider
  reference?: string
  lostTicketFee?: number
  attendant: string
  voided?: Correction
  refunds?: Refund[]
}

export interface ActivityEvent {
  id: string
  at: number
  event: string
  ref: string
  result: string
  /** Who performed it: attendant name, 'Kiosk E1' or 'Administrator'. */
  actor?: string
}

export interface Rate {
  initial: number
  initialMin: number
  incrementMin: number
  additional: number
  /** Charged on top of the time fee when the ticket is lost. */
  lostFee: number
}

/** Audit record for a void, refund or administrative session end. */
export interface Correction {
  at: number
  reason: string
  note?: string
  by: string
}

export interface Refund extends Correction {
  id: string
  amount: number
}

export const EXIT_VOID_REASONS = ['Wrong amount entered', 'Wrong payment method', 'Other'] as const
export const VOID_REASONS = ['Recorded in error', 'Duplicate payment', 'Test transaction', 'Other'] as const
export const REFUND_REASONS = ['Overcharge', 'Service complaint', 'Duplicate payment', 'Other'] as const
export const END_REASONS = ['Left without paying', 'Ticket issued in error', 'Vehicle towed or removed', 'Other'] as const

export interface RateConfig {
  version: string
  effective: number
  grace: number
  categories: Record<Category, Rate>
  history: { version: string; effective: number; by: string }[]
}

export type AttendantStatus = 'Active' | 'On break' | 'Offline' | 'Pending' | 'Disabled'

export interface Attendant {
  id: string
  name: string
  email: string
  lane: 'Lane A' | 'Lane B'
  status: AttendantStatus
  lastAccess?: number
  pinHash: string
  pinSalt: string
  /** Temporary PIN: must be replaced at the next sign-in. */
  mustChangePin: boolean
  failedAttempts: number
  lockedUntil?: number
}

export interface ExitSession {
  attendantId: string
  since: number
  lastActive: number
  locked: null | 'idle' | 'manual' | 'break'
}

export interface AdminAuth {
  pinHash: string
  pinSalt: string
  failedAttempts: number
  lockedUntil?: number
}

export interface Checkout {
  ticketId: string
  openedAt: number
  exitAt: number
  terminal: string
  attendant: string
  lostTicket?: boolean
}

export interface KioskClaim {
  kioskId: string
  slotId: string
  ticketId: string
  category: Category
  at: number
}

export interface Settings {
  welcomeResetSec: number
  idleTimeoutSec: number
  /** Exit terminal auto-lock after this many idle minutes. */
  exitLockMin: number
  autoWelcome: boolean
  receiptPrinters: number
}

export interface State {
  slots: Slot[]
  sessions: Record<string, Session>
  transactions: Transaction[] // newest first
  activity: ActivityEvent[] // newest first
  rates: RateConfig
  attendants: Attendant[]
  nextTicket: number
  nextTxn: number
  checkout: Checkout | null
  lastCompleted: string | null
  lastIssued: string | null
  claims: KioskClaim[]
  settings: Settings
  /** When the demo data was generated; seed timestamps end at this moment. */
  seededAt: number
  exitSession: ExitSession | null
  admin: AdminAuth
}
