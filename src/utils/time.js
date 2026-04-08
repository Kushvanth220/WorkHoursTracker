const TIME_PATTERN = /^(1[0-2]|[1-9])(a|p)$/i

export function normalizeTimeInput(value) {
  return value.trim().toLowerCase()
}

export function isValidTimeValue(value) {
  return TIME_PATTERN.test(normalizeTimeInput(value))
}

export function parseTimeInput(value) {
  const normalized = normalizeTimeInput(value)
  const match = normalized.match(TIME_PATTERN)

  if (!match) return null

  const hour = Number(match[1])
  const period = match[2]

  if (period === 'a') {
    return hour === 12 ? 0 : hour
  }

  return hour === 12 ? 12 : hour + 12
}

export function calculateWorkedHours(startValue, endValue) {
  const startHour = parseTimeInput(startValue)
  const endHour = parseTimeInput(endValue)

  if (startHour === null || endHour === null) return null
  if (endHour < startHour) return null

  return endHour - startHour
}
