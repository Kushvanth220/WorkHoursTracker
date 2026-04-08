import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { fileToProfilePhotoDataUrl } from './utils/image'
import { hashPin, randomSaltHex, verifyPin } from './utils/pin'
import {
  calculateWorkedHours,
  isValidTimeValue,
  normalizeTimeInput,
  parseTimeInput,
} from './utils/time'

const THEME_STORAGE_KEY = 'work-hours-tracker-theme'
const CREDENTIALS_KEY = 'work-hours-credentials-v1'
const APP_DATA_KEY = 'work-hours-app-data-v1'

const DEFAULT_CATEGORIES = [
  { id: 'on-campus-work', name: 'On Campus Work' },
  { id: 'off-campus-work', name: 'Off Campus Work' },
]

function createWeekData(weeks) {
  return weeks.map((week) => ({
    weekIndex: week.weekIndex,
    days: week.days.map((day) => ({
      date: day.date,
      start: '',
      end: '',
    })),
  }))
}

function hydrateWeekData(weeks, savedData = []) {
  return weeks.map((week) => {
    const savedWeek = savedData?.find((item) => item.weekIndex === week.weekIndex)
    return {
      weekIndex: week.weekIndex,
      days: week.days.map((day, index) => ({
        date: day.date,
        start: savedWeek?.days?.[index]?.start ?? '',
        end: savedWeek?.days?.[index]?.end ?? '',
      })),
    }
  })
}

function clampWeekCount(n) {
  return Math.max(1, Math.min(26, Number.isInteger(n) ? n : 10))
}

function defaultCategoryBundle() {
  const startDate = getTodayDateInputValue()
  const weekCount = 10
  const weeks = generateWeeks(startDate, weekCount)
  return {
    startDate,
    weekCount,
    weekData: createWeekData(weeks),
  }
}

function ensureBundle(raw) {
  if (!raw || typeof raw !== 'object') return defaultCategoryBundle()
  const startDate = raw.startDate || getTodayDateInputValue()
  const weekCount = clampWeekCount(raw.weekCount ?? 10)
  const weeks = generateWeeks(startDate, weekCount)
  return {
    startDate,
    weekCount,
    weekData: hydrateWeekData(weeks, raw.weekData),
  }
}

function initialCategoryBundles(categories) {
  return categories.reduce((acc, cat) => {
    acc[cat.id] = defaultCategoryBundle()
    return acc
  }, {})
}

function loadCredentials() {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.salt || !data?.pinHash) return null
    return { salt: data.salt, pinHash: data.pinHash }
  } catch {
    return null
  }
}

function loadAppData() {
  try {
    const raw = localStorage.getItem(APP_DATA_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveAppDataPayload(payload) {
  localStorage.setItem(APP_DATA_KEY, JSON.stringify(payload))
}

function App() {
  const [phase, setPhase] = useState(() => (loadCredentials() ? 'unlock' : 'create'))
  const [pinError, setPinError] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [activeCategoryId, setActiveCategoryId] = useState(DEFAULT_CATEGORIES[0].id)
  const [categoryBundles, setCategoryBundles] = useState(() => initialCategoryBundles(DEFAULT_CATEGORIES))

  const [themeMode, setThemeMode] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const [saveError, setSaveError] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')

  const [createPin, setCreatePin] = useState('')
  const [createPinConfirm, setCreatePinConfirm] = useState('')
  const [unlockPin, setUnlockPin] = useState('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  const applyLoadedAppData = useCallback((data) => {
    const savedCategories =
      Array.isArray(data?.categories) && data.categories.length > 0
        ? data.categories.filter((item) => item?.id && item?.name)
        : DEFAULT_CATEGORIES
    const bundlesIn = data?.categoryBundles && typeof data.categoryBundles === 'object' ? data.categoryBundles : {}
    const bundles = {}
    savedCategories.forEach((cat) => {
      bundles[cat.id] = ensureBundle(bundlesIn[cat.id])
    })
    const activeId = savedCategories.some((c) => c.id === data?.activeCategoryId)
      ? data.activeCategoryId
      : savedCategories[0].id
    setCategories(savedCategories)
    setCategoryBundles(bundles)
    setActiveCategoryId(activeId)
    setDisplayName(typeof data?.profile?.displayName === 'string' ? data.profile.displayName : '')
    setPhotoDataUrl(typeof data?.profile?.photoDataUrl === 'string' ? data.profile.photoDataUrl : '')
  }, [])

  const activeBundle = categoryBundles[activeCategoryId] ?? defaultCategoryBundle()
  const activeStartDate = activeBundle.startDate
  const activeWeekCount = activeBundle.weekCount

  const weeks = useMemo(
    () => generateWeeks(activeStartDate, activeWeekCount),
    [activeStartDate, activeWeekCount],
  )
  const endDate = useMemo(() => addDays(activeStartDate, activeWeekCount * 7 - 1), [activeStartDate, activeWeekCount])

  useEffect(() => {
    if (phase !== 'app') return
    const t = setTimeout(() => {
      try {
        const normalizedBundles = categories.reduce((acc, cat) => {
          acc[cat.id] = ensureBundle(categoryBundles[cat.id])
          return acc
        }, {})
        saveAppDataPayload({
          profile: { displayName, photoDataUrl },
          categories,
          activeCategoryId,
          categoryBundles: normalizedBundles,
        })
        setSaveError('')
      } catch {
        setSaveError('Could not save to this browser.')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [phase, displayName, photoDataUrl, categories, activeCategoryId, categoryBundles])

  function setActiveStartDate(value) {
    setCategoryBundles((prev) => {
      const b = ensureBundle(prev[activeCategoryId])
      const w = generateWeeks(value, b.weekCount)
      return {
        ...prev,
        [activeCategoryId]: {
          startDate: value,
          weekCount: b.weekCount,
          weekData: hydrateWeekData(w, b.weekData),
        },
      }
    })
  }

  function setActiveWeekCount(value) {
    const wc = clampWeekCount(value)
    setCategoryBundles((prev) => {
      const b = ensureBundle(prev[activeCategoryId])
      const w = generateWeeks(b.startDate, wc)
      return {
        ...prev,
        [activeCategoryId]: {
          startDate: b.startDate,
          weekCount: wc,
          weekData: hydrateWeekData(w, b.weekData),
        },
      }
    })
  }

  async function handleCreateProfile(event) {
    event.preventDefault()
    setPinError('')
    const name = displayName.trim()
    if (name.length < 1) {
      setPinError('Please enter your name.')
      return
    }
    if (createPin.length < 4) {
      setPinError('PIN must be at least 4 characters.')
      return
    }
    if (createPin !== createPinConfirm) {
      setPinError('PINs do not match.')
      return
    }
    try {
      const salt = randomSaltHex()
      const pinHash = await hashPin(createPin, salt)
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ salt, pinHash }))
      const initialBundles = initialCategoryBundles(DEFAULT_CATEGORIES)
      saveAppDataPayload({
        profile: { displayName: name, photoDataUrl },
        categories: DEFAULT_CATEGORIES,
        activeCategoryId: DEFAULT_CATEGORIES[0].id,
        categoryBundles: initialBundles,
      })
      setCategories(DEFAULT_CATEGORIES)
      setCategoryBundles(initialBundles)
      setActiveCategoryId(DEFAULT_CATEGORIES[0].id)
      setDisplayName(name)
      setCreatePin('')
      setCreatePinConfirm('')
      setPhase('app')
    } catch {
      setPinError('Could not save your PIN. Try again.')
    }
  }

  async function handleUnlock(event) {
    event.preventDefault()
    setPinError('')
    const cred = loadCredentials()
    if (!cred) {
      setPhase('create')
      return
    }
    const ok = await verifyPin(unlockPin, cred.salt, cred.pinHash)
    if (!ok) {
      setPinError('Wrong PIN.')
      setUnlockPin('')
      return
    }
    const data = loadAppData()
    if (data) {
      applyLoadedAppData(data)
    } else {
      applyLoadedAppData({
        categories: DEFAULT_CATEGORIES,
        categoryBundles: initialCategoryBundles(DEFAULT_CATEGORIES),
        activeCategoryId: DEFAULT_CATEGORIES[0].id,
        profile: {},
      })
    }
    setUnlockPin('')
    setPhase('app')
  }

  function lockProfile() {
    setPhase('unlock')
    setUnlockPin('')
    setPinError('')
  }

  async function onPhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const dataUrl = await fileToProfilePhotoDataUrl(file)
      setPhotoDataUrl(dataUrl)
    } catch {
      setSaveError('Could not use that image. Try a smaller JPG or PNG.')
    }
  }

  function updateDayValue(weekIndex, dayIndex, field, value) {
    setCategoryBundles((prev) => {
      const b = ensureBundle(prev[activeCategoryId])
      const w = generateWeeks(b.startDate, b.weekCount)
      let wd = hydrateWeekData(w, b.weekData)
      wd = wd.map((week) => {
        if (week.weekIndex !== weekIndex) return week
        return {
          ...week,
          days: week.days.map((day, idx) =>
            idx !== dayIndex ? day : { ...day, [field]: normalizeTimeInput(value) },
          ),
        }
      })
      return { ...prev, [activeCategoryId]: { ...b, weekData: wd } }
    })
  }

  function resetActiveCategory() {
    setCategoryBundles((prev) => ({
      ...prev,
      [activeCategoryId]: defaultCategoryBundle(),
    }))
  }

  function addCategory() {
    const trimmedName = newCategoryName.trim()
    if (!trimmedName) return
    const nextId = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    const nextCategory = { id: nextId, name: trimmedName }
    setCategories((prev) => [...prev, nextCategory])
    setCategoryBundles((prev) => ({ ...prev, [nextId]: defaultCategoryBundle() }))
    setActiveCategoryId(nextId)
    setNewCategoryName('')
  }

  function renameCategory(categoryId) {
    const current = categories.find((item) => item.id === categoryId)
    if (!current) return
    const nextName = window.prompt('Rename category', current.name)?.trim()
    if (!nextName) return
    setCategories((prev) =>
      prev.map((category) => (category.id === categoryId ? { ...category, name: nextName } : category)),
    )
  }

  function deleteCategory(categoryId) {
    if (categories.length <= 1) return
    const canDelete = window.confirm('Delete this category and all of its timings?')
    if (!canDelete) return
    const nextCategories = categories.filter((item) => item.id !== categoryId)
    setCategories(nextCategories)
    setCategoryBundles((prev) => {
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
    if (activeCategoryId === categoryId) {
      setActiveCategoryId(nextCategories[0].id)
    }
  }

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? categories[0]
  const activeWeekData = ensureBundle(categoryBundles[activeCategoryId]).weekData

  const computedWeeks = useMemo(
    () =>
      weeks.map((week, weekIdx) => {
        const rowData = week.days.map((day, dayIdx) => {
          const dayData = activeWeekData[weekIdx]?.days?.[dayIdx]
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
    [weeks, activeWeekData],
  )

  const grandTotal = computedWeeks.reduce((sum, week) => sum + week.weeklyTotal, 0)
  const averageWeeklyHours = activeWeekCount > 0 ? grandTotal / activeWeekCount : 0

  const categoryTotals = useMemo(
    () =>
      categories.map((category) => {
        const b = ensureBundle(categoryBundles[category.id])
        const w = generateWeeks(b.startDate, b.weekCount)
        const wd = hydrateWeekData(w, b.weekData)
        const total = wd.reduce(
          (weekTotal, week) =>
            weekTotal +
            week.days.reduce((sum, day) => sum + (calculateWorkedHours(day.start, day.end) ?? 0), 0),
          0,
        )
        return { ...category, total }
      }),
    [categories, categoryBundles],
  )

  function buildExportRows() {
    const rows = [['Category', 'Week', 'Day', 'Date', 'Start Hour', 'End Hour', 'Hours Worked']]
    weeks.forEach((week, weekIdx) => {
      week.days.forEach((day, dayIdx) => {
        const dayData = activeWeekData[weekIdx]?.days?.[dayIdx]
        const workedHours = calculateWorkedHours(dayData?.start, dayData?.end)
        rows.push([
          activeCategory?.name ?? '',
          `Week ${week.weekIndex}`,
          day.dayName,
          formatDate(day.date),
          dayData?.start ?? '',
          dayData?.end ?? '',
          workedHours === null ? '' : workedHours.toFixed(2),
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

  if (phase === 'create') {
    return (
      <main className="app">
        <section className="card auth-card pin-card">
          <h1>Create your profile</h1>
          <p className="pin-sub">Set a PIN to protect your hours. Everything stays on this device.</p>
          <form onSubmit={handleCreateProfile} className="pin-form">
            <label>
              <span>Your name</span>
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
              />
            </label>
            <div className="avatar-field">
              <span className="field-label">Profile photo (optional)</span>
              <div className="avatar-row">
                <label className="avatar-upload-btn">
                  <input type="file" accept="image/*" onChange={onPhotoChange} />
                  Choose photo
                </label>
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="" className="avatar-preview" />
                ) : null}
              </div>
            </div>
            <label>
              <span>Create PIN (min 4 characters)</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={createPin}
                onChange={(e) => setCreatePin(e.target.value)}
                placeholder="••••"
              />
            </label>
            <label>
              <span>Confirm PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={createPinConfirm}
                onChange={(e) => setCreatePinConfirm(e.target.value)}
                placeholder="••••"
              />
            </label>
            {pinError ? <p className="error">{pinError}</p> : null}
            <button type="submit">Save and continue</button>
          </form>
        </section>
      </main>
    )
  }

  if (phase === 'unlock') {
    return (
      <main className="app">
        <section className="card auth-card pin-card">
          <h1>Welcome back</h1>
          <p className="pin-sub">Enter your PIN to open your profile.</p>
          <form onSubmit={handleUnlock} className="pin-form">
            <label>
              <span>PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value)}
                placeholder="••••"
                autoFocus
              />
            </label>
            {pinError ? <p className="error">{pinError}</p> : null}
            <button type="submit">Unlock</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <header className="header profile-header">
        <div className="header-main">
          <h1>Work Hours Tracker</h1>
          <p className="header-tagline">Each category has its own dates, weeks, and hours.</p>
        </div>
        <div className="profile-toolbar card">
          <label className="avatar-upload-circle">
            <input type="file" accept="image/*" onChange={onPhotoChange} aria-label="Change profile photo" />
            {photoDataUrl ? (
              <img src={photoDataUrl} alt="" className="avatar-circle-img" />
            ) : (
              <span className="avatar-circle-placeholder">+</span>
            )}
          </label>
          <label className="profile-name-wrap">
            <span className="sr-only">Your name</span>
            <input
              type="text"
              className="profile-name-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>
          <button type="button" className="ghost lock-btn" onClick={lockProfile}>
            Lock profile
          </button>
        </div>
      </header>

      <ControlCard
        startDate={activeStartDate}
        weekCount={activeWeekCount}
        endDate={toDateInputValue(endDate)}
        grandTotal={grandTotal}
        categoryName={activeCategory?.name}
        themeMode={themeMode}
        onStartDateChange={setActiveStartDate}
        onWeekCountChange={setActiveWeekCount}
        onToggleTheme={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onReset={resetActiveCategory}
        onExportCsv={exportCsv}
        onExportExcel={exportExcel}
        onPrint={printAsPdf}
      />

      <section className="card categories-card">
        <div className="categories-header">
          <h2>Categories</h2>
        </div>
        <p className="categories-hint">Tap a category to edit its own schedule. Totals are separate per category.</p>
        <div className="category-add-row">
          <input
            type="text"
            placeholder="Add category"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
          <button type="button" onClick={addCategory}>
            Add
          </button>
        </div>
        <div className="category-grid">
          {categoryTotals.map((category) => (
            <article
              key={category.id}
              className={`category-tile ${category.id === activeCategoryId ? 'active' : ''}`}
            >
              <button type="button" className="category-open" onClick={() => setActiveCategoryId(category.id)}>
                <span>{category.name}</span>
                <strong>{category.total.toFixed(2)} hrs</strong>
              </button>
              <div className="category-actions">
                <button type="button" className="ghost" onClick={() => renameCategory(category.id)}>
                  Rename
                </button>
                <button type="button" className="ghost" onClick={() => deleteCategory(category.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {saveError ? <p className="error global-error">{saveError}</p> : null}

      <section className="weeks-grid">
        {computedWeeks.map((week) => (
          <WeekCard key={week.weekIndex} week={week} onFieldChange={updateDayValue} />
        ))}
      </section>

      <SummaryCard
        grandTotal={grandTotal}
        weekCount={activeWeekCount}
        averageWeeklyHours={averageWeeklyHours}
        startDate={activeStartDate}
        endDate={toDateInputValue(endDate)}
        title={`${activeCategory?.name ?? 'Category'} summary`}
      />
    </main>
  )
}

export default App
