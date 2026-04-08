import { formatDate } from '../utils/date'

export function SummaryCard({ grandTotal, weekCount, averageWeeklyHours, startDate, endDate }) {
  return (
    <section className="card summary-card">
      <h2>Summary</h2>
      <div className="summary-grid">
        <p>
          <strong>Grand Total Hours:</strong> {grandTotal.toFixed(2)}
        </p>
        <p>
          <strong>Total Weeks:</strong> {weekCount}
        </p>
        <p>
          <strong>Average Weekly Hours:</strong> {averageWeeklyHours.toFixed(2)}
        </p>
        <p>
          <strong>Date Range:</strong> {formatDate(startDate)} - {formatDate(endDate)}
        </p>
      </div>
    </section>
  )
}
