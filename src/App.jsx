import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { ControlCard } from './components/ControlCard'
import { SummaryCard } from './components/SummaryCard'
import { WeekCard } from './components/WeekCard'
import {
  addDays,
  formatDate,
  generateWeeks,
  getTodayDateInputValue,
  toDateInputValue,
} from './utils/date'
import {
  calculateWorkedHours,
  isValidTimeValue,
  normalizeTimeInput,
  parseTimeInput,
} from './utils/time'

const STORAGE_KEY = 'work-hours-tracker-v1'
const THEME_STORAGE_KEY = 'work-hours-tracker-theme'

function createWeekData(weeks) {
  return weeks.map((week) => ({
    weekIndex: week.weekIndex,
    days: week.days.map((day) => ({
      date: day.date,
      start: '',
      end: '',
      notes: '',
    })),
  }))
}

function hydrateWeekData(weeks, savedData) {
  return weeks.map((week) => {
    const savedWeek = savedData?.find((item) => item.weekIndex === week.weekIndex)
    return {
      weekIndex: week.weekIndex,
      days: week.days.map((day, index) => ({
        date: day.date,
        start: savedWeek?.days?.[index]?.start ?? '',
        end: savedWeek?.days?.[index]?.end ?? '',
        notes: savedWeek?.days?.[index]?.notes ?? '',
      })),
    }
  })
}

function App() {
  const [startDate, setStartDate] = useState(getTodayDateInputValue())
  const [weekCount, setWeekCount] = useState(10)
  const [weekData, setWeekData] = useState(() => createWeekData(generateWeeks(getTodayDateInputValue(), 10)))
  const [themeMode, setThemeMode] = useState('light')
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)

  const weeks = useMemo(() => generateWeeks(startDate, weekCount), [startDate, weekCount])
  const endDate = useMemo(() => addDays(startDate, weekCount * 7 - 1), [startDate, weekCount])

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setThemeMode(savedTheme)
      } else {
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
        setThemeMode(prefersDark ? 'dark' : 'light')
      }

      const savedRaw = localStorage.getItem(STORAGE_KEY)
      if (!savedRaw) {
        setWeekData(createWeekData(weeks))
        setHasLoadedFromStorage(true)
        return
      }
      const saved = JSON.parse(savedRaw)
      const savedStartDate = saved?.startDate || getTodayDateInputValue()
      const savedWeekCount = Number.isInteger(saved?.weekCount) ? saved.weekCount : 10
      const clampedWeekCount = Math.max(1, Math.min(26, savedWeekCount))
      setStartDate(savedStartDate)
      setWeekCount(clampedWeekCount)
      const initialWeeks = generateWeeks(savedStartDate, clampedWeekCount)
      setWeekData(hydrateWeekData(initialWeeks, saved?.weekData))
    } catch {
      setWeekData(createWeekData(weeks))
    } finally {
      setHasLoadedFromStorage(true)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    if (!hasLoadedFromStorage) return
    setWeekData((prev) => hydrateWeekData(weeks, prev))
  }, [weeks, hasLoadedFromStorage])

  useEffect(() => {
    if (!hasLoadedFromStorage) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startDate,
        weekCount,
        weekData,
      }),
    )
  }, [startDate, weekCount, weekData, hasLoadedFromStorage])

  function updateDayValue(weekIndex, dayIndex, field, value) {
    setWeekData((prev) =>
      prev.map((week) => {
        if (week.weekIndex !== weekIndex) return week
        return {
          ...week,
          days: week.days.map((day, idx) => {
            if (idx !== dayIndex) return day
            return { ...day, [field]: field === 'notes' ? value : normalizeTimeInput(value) }
          }),
        }
      }),
    )
  }

  function resetAll() {
    const nextStartDate = getTodayDateInputValue()
    setStartDate(nextStartDate)
    setWeekCount(10)
    setWeekData(createWeekData(generateWeeks(nextStartDate, 10)))
    localStorage.removeItem(STORAGE_KEY)
  }

  function generateTimesheet() {
    setWeekData((prev) => hydrateWeekData(weeks, prev))
  }

  function buildExportRows() {
    const rows = [['Week', 'Day', 'Date', 'Start Hour', 'End Hour', 'Hours Worked', 'Notes']]
    weeks.forEach((week, weekIdx) => {
      week.days.forEach((day, dayIdx) => {
        const dayData = weekData[weekIdx]?.days?.[dayIdx]
        const workedHours = calculateWorkedHours(dayData?.start, dayData?.end)
        rows.push([
          `Week ${week.weekIndex}`,
          day.dayName,
          formatDate(day.date),
          dayData?.start ?? '',
          dayData?.end ?? '',
          workedHours === null ? '' : workedHours.toFixed(2),
          dayData?.notes ?? '',
        ])
      })
    })
    return rows
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    const rows = buildExportRows()
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n')
    downloadFile(csv, 'work-hours-timesheet.csv', 'text/csv;charset=utf-8')
  }

  function exportExcel() {
    const rows = buildExportRows()
    const tsv = rows.map((row) => row.join('\t')).join('\n')
    downloadFile(tsv, 'work-hours-timesheet.xls', 'application/vnd.ms-excel')
  }

  function printAsPdf() {
    window.print()
  }

  const computedWeeks = useMemo(
    () =>
      weeks.map((week, weekIdx) => {
        const rowData = week.days.map((day, dayIdx) => {
          const dayData = weekData[weekIdx]?.days?.[dayIdx]
          const start = dayData?.start ?? ''
          const end = dayData?.end ?? ''
          const startValid = start === '' || isValidTimeValue(start)
          const endValid = end === '' || isValidTimeValue(end)
          let error = ''

          if (!startValid || !endValid) {
            error = 'Please enter time like 6a or 6p'
          } else if (start && end) {
            const startHour = parseTimeInput(start)
            const endHour = parseTimeInput(end)
            if (startHour !== null && endHour !== null && endHour < startHour) {
              error = 'End time must be after start time'
            }
          }

          const workedHours = error ? null : calculateWorkedHours(start, end)

          return {
            ...day,
            start,
            end,
            notes: dayData?.notes ?? '',
            workedHours,
            error,
          }
        })

        const weeklyTotal = rowData.reduce((total, row) => total + (row.workedHours ?? 0), 0)

        return {
          ...week,
          rows: rowData,
          weeklyTotal,
        }
      }),
    [weeks, weekData],
  )

  const grandTotal = computedWeeks.reduce((sum, week) => sum + week.weeklyTotal, 0)
  const averageWeeklyHours = weekCount > 0 ? grandTotal / weekCount : 0

  return (
    <main className="app">
      <header className="header">
        <h1>Work Hours Tracker</h1>
        <p>Track your daily and weekly work hours easily</p>
      </header>

      <ControlCard
        startDate={startDate}
        weekCount={weekCount}
        endDate={toDateInputValue(endDate)}
        themeMode={themeMode}
        onStartDateChange={setStartDate}
        onWeekCountChange={(value) => setWeekCount(Math.max(1, Math.min(26, value)))}
        onToggleTheme={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onGenerate={generateTimesheet}
        onReset={resetAll}
        onExportCsv={exportCsv}
        onExportExcel={exportExcel}
        onPrint={printAsPdf}
      />

      <section className="weeks-grid">
        {computedWeeks.map((week) => (
          <WeekCard key={week.weekIndex} week={week} onFieldChange={updateDayValue} />
        ))}
      </section>

      <SummaryCard
        grandTotal={grandTotal}
        weekCount={weekCount}
        averageWeeklyHours={averageWeeklyHours}
        startDate={startDate}
        endDate={toDateInputValue(endDate)}
      />
    </main>
  )
}

export default App
