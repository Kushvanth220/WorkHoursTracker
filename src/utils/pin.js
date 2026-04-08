function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomSaltHex() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bufferToHex(bytes.buffer)
}

export async function hashPin(pin, saltHex) {
  const text = `${saltHex}:${pin}`
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(digest)
}

export async function verifyPin(pin, saltHex, storedHashHex) {
  const next = await hashPin(pin, saltHex)
  return next === storedHashHex
}
