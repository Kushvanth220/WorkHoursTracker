const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function addDays(value, daysToAdd) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + daysToAdd)
  return date
}

export function toDateInputValue(date) {
  return date.toISOString().slice(0, 10)
}

export function getTodayDateInputValue() {
  return toDateInputValue(new Date())
}

export function formatDate(value) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function generateWeeks(startDate, weekCount) {
  const start = new Date(`${startDate}T00:00:00`)

  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + weekIndex * 7)

    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const dayDate = new Date(weekStart)
      dayDate.setDate(weekStart.getDate() + dayIndex)
      return {
        dayName: DAY_NAMES[dayDate.getDay()],
        date: toDateInputValue(dayDate),
        isWeekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
      }
    })

    return {
      weekIndex: weekIndex + 1,
      startDate: days[0].date,
      endDate: days[6].date,
      days,
    }
  })
}
