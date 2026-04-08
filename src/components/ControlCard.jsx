export function ControlCard({
  startDate,
  weekCount,
  endDate,
  grandTotal,
  categoryName,
  themeMode,
  onStartDateChange,
  onWeekCountChange,
  onToggleTheme,
  onReset,
  onExportCsv,
  onExportExcel,
  onPrint,
}) {
  return (
    <section className="card control-card">
      <div className="control-top">
        <div>
          <p className="kpi-label">Total hours — {categoryName || 'this category'}</p>
          <p className="kpi-value">{grandTotal.toFixed(2)}</p>
        </div>
      </div>
      <p className="control-category-hint">Dates and weeks below apply only while this category is selected.</p>
      <div className="control-grid">
        <label>
          <span>Start Date</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </label>
        <label>
          <span>Number of Weeks</span>
          <input
            type="number"
            min="1"
            max="26"
            value={weekCount}
            onChange={(event) => onWeekCountChange(Number(event.target.value) || 1)}
          />
        </label>
        <label>
          <span>End Date</span>
          <input type="date" value={endDate} readOnly />
        </label>
      </div>
      <div className="button-row">
        <button onClick={onToggleTheme} className="ghost">
          {themeMode === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
        </button>
        <button onClick={onReset} className="ghost">
          Reset category
        </button>
        <button onClick={onExportCsv} className="secondary">
          Export CSV
        </button>
        <button onClick={onExportExcel} className="secondary">
          Export Excel
        </button>
        <button onClick={onPrint} className="secondary">
          Print / PDF
        </button>
      </div>
    </section>
  )
}
