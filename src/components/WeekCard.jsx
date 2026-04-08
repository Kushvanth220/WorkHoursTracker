import { formatDate } from '../utils/date'

export function WeekCard({ week, onFieldChange }) {
  return (
    <article className="card week-card">
      <div className="week-card-header">
        <h2>Week {week.weekIndex}</h2>
        <p>
          {formatDate(week.startDate)} - {formatDate(week.endDate)}
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Date</th>
              <th>Start Hour</th>
              <th>End Hour</th>
              <th>Hours Worked</th>
            </tr>
          </thead>
          <tbody>
            {week.rows.map((row, dayIndex) => (
              <tr key={`${week.weekIndex}-${row.date}`} className={row.isWeekend ? 'weekend' : ''}>
                <td data-label="Day">{row.dayName}</td>
                <td data-label="Date">{formatDate(row.date)}</td>
                <td data-label="Start Hour">
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="6a"
                    value={row.start}
                    onChange={(event) =>
                      onFieldChange(week.weekIndex, dayIndex, 'start', event.target.value)
                    }
                  />
                  {row.error ? <small className="error">{row.error}</small> : null}
                </td>
                <td data-label="End Hour">
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="6p"
                    value={row.end}
                    onChange={(event) =>
                      onFieldChange(week.weekIndex, dayIndex, 'end', event.target.value)
                    }
                  />
                </td>
                <td data-label="Hours Worked">
                  {row.workedHours === null ? '-' : row.workedHours.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="total-label">
                Weekly Total Hours
              </td>
              <td>{week.weeklyTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </article>
  )
}
