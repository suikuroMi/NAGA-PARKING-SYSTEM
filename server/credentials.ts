import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function credentials(pin: string) {
  const pinSalt = randomBytes(16).toString('hex')
  return { pinSalt, pinHash: scryptSync(pin, pinSalt, 32).toString('hex') }
}

export function checkPin(pin: string, salt: string, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) return false
  return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(hash, 'hex'))
}
