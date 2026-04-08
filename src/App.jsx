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
const REGISTRY_KEY = 'work-hours-registry-v1'
const LEGACY_CREDENTIALS_KEY = 'work-hours-credentials-v1'
const LEGACY_APP_DATA_KEY = 'work-hours-app-data-v1'

const DEFAULT_CATEGORIES = [
  { id: 'on-campus-work', name: 'On Campus Work' },
  { id: 'off-campus-work', name: 'Off Campus Work' },
]

function profileStorageKey(id) {
  return `work-hours-profile-${id}`
}

function migrateLegacyIfNeeded() {
  try {
    if (localStorage.getItem(REGISTRY_KEY)) return
    const credRaw = localStorage.getItem(LEGACY_CREDENTIALS_KEY)
    if (!credRaw) return
    const cred = JSON.parse(credRaw)
    if (!cred?.salt || !cred?.pinHash) return
    const id = crypto.randomUUID()
    const appRaw = localStorage.getItem(LEGACY_APP_DATA_KEY)
    const payload =
      appRaw && appRaw.length > 0
        ? JSON.parse(appRaw)
        : {
            profile: {},
            categories: DEFAULT_CATEGORIES,
            activeCategoryId: DEFAULT_CATEGORIES[0].id,
            categoryBundles: initialCategoryBundles(DEFAULT_CATEGORIES),
          }
    localStorage.setItem(REGISTRY_KEY, JSON.stringify({ version: 1, profiles: [{ id, salt: cred.salt, pinHash: cred.pinHash }] }))
    localStorage.setItem(profileStorageKey(id), JSON.stringify(payload))
    localStorage.removeItem(LEGACY_CREDENTIALS_KEY)
    localStorage.removeItem(LEGACY_APP_DATA_KEY)
  } catch {
    /* ignore */
  }
}

function loadRegistry() {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    if (!raw) return { version: 1, profiles: [] }
    const data = JSON.parse(raw)
    const profiles = Array.isArray(data?.profiles) ? data.profiles.filter((p) => p?.id && p?.salt && p?.pinHash) : []
    return { version: 1, profiles }
  } catch {
    return { version: 1, profiles: [] }
  }
}

function saveRegistry(profiles) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify({ version: 1, profiles }))
}

function loadProfilePayload(profileId) {
  try {
    const raw = localStorage.getItem(profileStorageKey(profileId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveProfilePayload(profileId, payload) {
  localStorage.setItem(profileStorageKey(profileId), JSON.stringify(payload))
}

function hasAnyProfile() {
  return loadRegistry().profiles.length > 0
}

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

function App() {
  const [phase, setPhase] = useState(() => (hasAnyProfile() ? 'unlock' : 'create'))
  const [pinError, setPinError] = useState('')
  const [activeProfileId, setActiveProfileId] = useState(null)

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

  const [deleteProfilePin, setDeleteProfilePin] = useState('')
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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
    if (phase !== 'app' || !activeProfileId) return
    const t = setTimeout(() => {
      try {
        const normalizedBundles = categories.reduce((acc, cat) => {
          acc[cat.id] = ensureBundle(categoryBundles[cat.id])
          return acc
        }, {})
        saveProfilePayload(activeProfileId, {
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
  }, [phase, activeProfileId, displayName, photoDataUrl, categories, activeCategoryId, categoryBundles])

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

  async function isPinAlreadyUsed(pin) {
    const { profiles } = loadRegistry()
    for (const p of profiles) {
      if (await verifyPin(pin, p.salt, p.pinHash)) return true
    }
    return false
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
    if (await isPinAlreadyUsed(createPin)) {
      setPinError('This PIN is already used by another profile on this device. Choose a different PIN.')
      return
    }
    try {
      const id = crypto.randomUUID()
      const salt = randomSaltHex()
      const pinHash = await hashPin(createPin, salt)
      const reg = loadRegistry()
      reg.profiles.push({ id, salt, pinHash })
      saveRegistry(reg.profiles)

      const initialBundles = initialCategoryBundles(DEFAULT_CATEGORIES)
      const payload = {
        profile: { displayName: name, photoDataUrl },
        categories: DEFAULT_CATEGORIES,
        activeCategoryId: DEFAULT_CATEGORIES[0].id,
        categoryBundles: initialBundles,
      }
      saveProfilePayload(id, payload)

      setCategories(DEFAULT_CATEGORIES)
      setCategoryBundles(initialBundles)
      setActiveCategoryId(DEFAULT_CATEGORIES[0].id)
      setDisplayName(name)
      setActiveProfileId(id)
      setCreatePin('')
      setCreatePinConfirm('')
      setPhase('app')
    } catch {
      setPinError('Could not save your profile. Try again.')
    }
  }

  async function handleUnlock(event) {
    event.preventDefault()
    setPinError('')
    const { profiles } = loadRegistry()
    if (profiles.length === 0) {
      setPhase('create')
      return
    }
    let matchedId = null
    for (const p of profiles) {
      if (await verifyPin(unlockPin, p.salt, p.pinHash)) {
        matchedId = p.id
        break
      }
    }
    if (!matchedId) {
      setPinError('Wrong PIN. Try again, or create a new profile if you are new here.')
      setUnlockPin('')
      return
    }
    const data = loadProfilePayload(matchedId)
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
    setActiveProfileId(matchedId)
    setUnlockPin('')
    setPhase('app')
  }

  function lockProfile() {
    setActiveProfileId(null)
    setPhase(hasAnyProfile() ? 'unlock' : 'create')
    setUnlockPin('')
    setPinError('')
    setDeleteProfilePin('')
    setDeleteConfirmChecked(false)
    setDeleteError('')
  }

  async function handleDeleteProfile(event) {
    event.preventDefault()
    setDeleteError('')
    if (!activeProfileId) return
    if (!deleteConfirmChecked) {
      setDeleteError('Check the box to confirm you want to delete this profile.')
      return
    }
    const reg = loadRegistry()
    const entry = reg.profiles.find((p) => p.id === activeProfileId)
    if (!entry) {
      setDeleteError('Could not find this profile.')
      return
    }
    const pinOk = await verifyPin(deleteProfilePin, entry.salt, entry.pinHash)
    if (!pinOk) {
      setDeleteError('Wrong PIN.')
      setDeleteProfilePin('')
      return
    }
    if (!window.confirm('Delete this profile forever? All hours, categories, and settings for it will be removed.')) {
      return
    }
    try {
      const nextProfiles = reg.profiles.filter((p) => p.id !== activeProfileId)
      localStorage.removeItem(profileStorageKey(activeProfileId))
      if (nextProfiles.length === 0) {
        localStorage.removeItem(REGISTRY_KEY)
      } else {
        saveRegistry(nextProfiles)
      }
      setActiveProfileId(null)
      setDeleteProfilePin('')
      setDeleteConfirmChecked(false)
      setCategories(DEFAULT_CATEGORIES)
      setCategoryBundles(initialCategoryBundles(DEFAULT_CATEGORIES))
      setActiveCategoryId(DEFAULT_CATEGORIES[0].id)
      setDisplayName('')
      setPhotoDataUrl('')
      setPhase(nextProfiles.length > 0 ? 'unlock' : 'create')
    } catch {
      setDeleteError('Could not delete this profile. Try again.')
    }
  }

  function goToCreateProfile() {
    setPinError('')
    setDisplayName('')
    setPhotoDataUrl('')
    setCreatePin('')
    setCreatePinConfirm('')
    setPhase('create')
  }

  function backToUnlockFromCreate() {
    setPinError('')
    if (hasAnyProfile()) {
      setPhase('unlock')
    }
  }

  async function onPhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const dataUrl = await fileToProfilePhotoDataUrl(file, 400, 600_000)
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
  const greetingName = displayName.trim() || 'there'

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
    const previewName = displayName.trim() || '…'
    return (
      <main className="app">
        <section className="card auth-card create-profile-card">
          {hasAnyProfile() ? (
            <button type="button" className="ghost back-to-pin" onClick={backToUnlockFromCreate}>
              ← I already have a PIN
            </button>
          ) : null}

          <div className="greeting-hero">
            <label className="greeting-hero-avatar" aria-label="Upload profile photo">
              <input type="file" accept="image/*" onChange={onPhotoChange} />
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="" className="greeting-hero-img" />
              ) : (
                <span className="greeting-hero-placeholder">Add photo</span>
              )}
            </label>
            <p className="greeting-hero-title">
              Hello <strong>{previewName}</strong>
            </p>
            <p className="greeting-hero-line">This is your profile.</p>
            <p className="greeting-hero-sub">Here you can track your hours.</p>
          </div>

          <h2 className="create-form-title">Finish setup</h2>
          <p className="pin-sub">Choose a unique PIN — each PIN keeps its own hours on this device.</p>

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
            <button type="submit">Create profile & continue</button>
          </form>
        </section>
      </main>
    )
  }

  if (phase === 'unlock') {
    const count = loadRegistry().profiles.length
    return (
      <main className="app">
        <section className="card auth-card pin-card unlock-card">
          <h1>I already have a PIN</h1>
          <p className="pin-sub unlock-lead">
            Enter your PIN to open <strong>your</strong> profile. On this device, <strong>each PIN is its own profile</strong>{' '}
            — separate hours, categories, and dates.
          </p>
          {count > 1 ? (
            <p className="unlock-hint">{count} profiles saved — your PIN opens the one that matches.</p>
          ) : null}
          <form onSubmit={handleUnlock} className="pin-form">
            <label>
              <span>Your PIN</span>
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
            <button type="submit">Open my profile</button>
          </form>
          <div className="unlock-footer">
            <p className="unlock-footer-label">New here?</p>
            <button type="button" className="ghost wide" onClick={goToCreateProfile}>
              Create a new profile (new PIN)
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="card greeting-dashboard">
        <div className="greeting-dashboard-visual">
          <label className="greeting-dashboard-avatar" aria-label="Change profile photo">
            <input type="file" accept="image/*" onChange={onPhotoChange} />
            {photoDataUrl ? (
              <img src={photoDataUrl} alt="" className="greeting-dashboard-img" />
            ) : (
              <span className="greeting-dashboard-placeholder">Tap to add photo</span>
            )}
          </label>
          <div className="greeting-dashboard-copy">
            <p className="greeting-dashboard-greet">
              Hello <strong>{greetingName}</strong> — this is your profile.
            </p>
            <p className="greeting-dashboard-tagline">Here you can track your hours.</p>
            <label className="greeting-dashboard-name-label">
              <span className="sr-only">Your name</span>
              <input
                type="text"
                className="greeting-dashboard-name-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <button type="button" className="ghost lock-profile-btn" onClick={lockProfile}>
              Lock profile
            </button>
          </div>
        </div>

        <form className="delete-profile-zone" onSubmit={handleDeleteProfile}>
          <h3 className="delete-profile-title">Delete this profile</h3>
          <p className="delete-profile-desc">
            Enter your PIN and confirm below. This removes only <strong>this</strong> profile from this device. After that,
            you can create a new profile with the same PIN if you want.
          </p>
          <label>
            <span>Your PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={deleteProfilePin}
              onChange={(e) => {
                setDeleteProfilePin(e.target.value)
                setDeleteError('')
              }}
              placeholder="••••"
            />
          </label>
          <label className="delete-profile-checkbox-label">
            <input
              type="checkbox"
              checked={deleteConfirmChecked}
              onChange={(e) => {
                setDeleteConfirmChecked(e.target.checked)
                setDeleteError('')
              }}
            />
            <span>I want to permanently delete this entire profile</span>
          </label>
          {deleteError ? <p className="error">{deleteError}</p> : null}
          <button type="submit" className="delete-profile-submit">
            Delete profile
          </button>
        </form>
      </section>

      <header className="header header-compact">
        <h1>Work Hours Tracker</h1>
        <p className="header-tagline">Each category has its own dates, weeks, and hours.</p>
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
