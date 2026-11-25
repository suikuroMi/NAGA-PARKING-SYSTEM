export const isValidPin = (pin: string) => /^\d{4}$/.test(pin)

/** Rejects repeated digits (1111), straight runs (1234, 4321) and 0000. */
export function isWeakPin(pin: string) {
  if (/^(\d)\1{3}$/.test(pin)) return true
  const d = [...pin].map(Number)
  const steps = d.slice(1).map((x, i) => x - d[i])
  return steps.every((s) => s === 1) || steps.every((s) => s === -1)
}

export function randomPin() {
  for (;;) {
    const n = new Uint16Array(1)
    crypto.getRandomValues(n)
    const pin = String(n[0] % 10000).padStart(4, '0')
    if (!isWeakPin(pin)) return pin
  }
}
