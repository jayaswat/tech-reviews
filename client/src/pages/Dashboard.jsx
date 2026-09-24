import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  LabelList,
} from 'recharts';
import api from '../api';
import StatCard from '../components/StatCard';
import RatingStars from '../components/RatingStars';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearIso() {
  return `${new Date().getFullYear()}-01-01`;
}

function lastDayOfMonthIso(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(startOfYearIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [tech, setTech] = useState('');
  const [techs, setTechs] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [vendors, setVendors] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());

  const [summary, setSummary] = useState(null);
  const [byTech, setByTech] = useState([]);
  const [byVendor, setByVendor] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [attention, setAttention] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/techs').then((res) => setTechs(res.data.techs));
    api.get('/vendors').then((res) => setVendors(res.data.vendors));
  }, []);

  useEffect(() => {
    const params = { startDate, endDate };
    if (tech) params.tech = tech;
    if (vendorId) params.vendorId = vendorId;
    setLoading(true);
    Promise.all([
      api.get('/analytics/summary', { params }),
      api.get('/analytics/by-tech', { params }),
      api.get('/analytics/by-vendor', { params }),
      api.get('/analytics/monthly', { params: { year, tech: tech || undefined, vendorId: vendorId || undefined } }),
      api.get('/analytics/yearly', { params: { tech: tech || undefined, vendorId: vendorId || undefined } }),
      api.get('/analytics/attention', { params: { ...params, maxRating: 3, limit: 10 } }),
    ]).then(([summaryRes, byTechRes, byVendorRes, monthlyRes, yearlyRes, attentionRes]) => {
      setSummary(summaryRes.data);
      setByTech(byTechRes.data.rows);
      setByVendor(byVendorRes.data.rows);
      setMonthly(monthlyRes.data.rows);
      setYearly(yearlyRes.data.rows);
      setAttention(attentionRes.data.rows);
      setLoading(false);
    });
  }, [startDate, endDate, tech, vendorId, year]);

  const monthlyChartData = useMemo(
    () => monthly.map((m) => ({ month: MONTH_LABELS[m.month - 1], monthNum: m.month, count: m.count, avgRating: m.avgRating })),
    [monthly]
  );

  function goToReviews(overrides) {
    const merged = { startDate, endDate, tech, vendorId, ...overrides };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    navigate(`/reviews?${params.toString()}`);
  }

  function handleMonthClick(chartState) {
    const point = chartState?.activePayload?.[0]?.payload;
    if (!point || !point.count) return;
    goToReviews({
      startDate: `${year}-${String(point.monthNum).padStart(2, '0')}-01`,
      endDate: lastDayOfMonthIso(year, point.monthNum),
    });
  }

  return (
    <div className="page">
      <h1>Analytics Dashboard</h1>

      <div className="filter-bar">
        <label>
          From
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label>
          Technician
          <select value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">All technicians</option>
            {techs.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {vendors.length > 0 && (
          <label>
            Vendor
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorName ? `${v.vendorName} (${v.vendorId})` : v.vendorId}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Trend year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearly.map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
              </option>
            ))}
            {yearly.length === 0 && <option value={year}>{year}</option>}
          </select>
        </label>
      </div>

      {loading && <div className="page-loading">Loading analytics...</div>}

      {!loading && summary && (
        <>
          <div className="stat-grid">
            <StatCard label="Reviews in range" value={summary.count} />
            <StatCard label="Average rating" value={summary.avgRating ?? '—'} sub="out of 5 stars" />
            <StatCard label="Technicians reviewed" value={byTech.length} />
            {vendors.length > 0 && <StatCard label="Vendors reviewed" value={byVendor.length} />}
          </div>

          <div className="chart-card attention-card">
            <h2>Needs attention — 3★ or below</h2>
            {attention.length === 0 ? (
              <p className="muted">No low ratings in this range. Nice work.</p>
            ) : (
              <ul className="attention-list">
                {attention.map((r) => (
                  <li key={r.id}>
                    <div className="attention-row">
                      <RatingStars rating={r.star_rating} />
                      <span className="attention-name">
                        {r.customer_first_name} {r.customer_last_name}
                      </span>
                      <span className="muted">· {r.tech_name || 'Unassigned'} · {r.review_date}</span>
                      {r.contact && <span className="muted attention-contact">· {r.contact}</span>}
                    </div>
                    {r.review_text && <p className="attention-comment">"{r.review_text}"</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="chart-grid">
            <div className="chart-card">
              <h2>Average rating by technician</h2>
              {byTech.length === 0 ? (
                <p className="muted">No reviews in this range yet.</p>
              ) : (
                <>
                  <p className="chart-hint muted">Click a row to see that technician's reviews.</p>
                  <ResponsiveContainer width="100%" height={Math.max(220, byTech.length * 36)}>
                    <BarChart
                      data={byTech}
                      layout="vertical"
                      margin={{ left: 40, right: 45 }}
                      style={{ cursor: 'pointer' }}
                      onClick={(state) => {
                        const p = state?.activePayload?.[0]?.payload;
                        if (p) goToReviews({ tech: p.techName });
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 5]} />
                      <YAxis type="category" dataKey="techName" width={120} />
                      <Tooltip formatter={(value, name) => (name === 'avgRating' ? [value, 'Avg rating'] : [value, 'Reviews'])} />
                      <Bar dataKey="avgRating" fill="#e7000b" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="avgRating" position="right" style={{ fill: 'var(--text)', fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>

            <div className="chart-card">
              <h2>Rating distribution</h2>
              <p className="chart-hint muted">Click a column to see those reviews.</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={Object.entries(summary.ratingDistribution).map(([stars, count]) => ({
                    stars: `${stars}★`,
                    rating: Number(stars),
                    count,
                  }))}
                  margin={{ top: 20 }}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const p = state?.activePayload?.[0]?.payload;
                    if (p) goToReviews({ minRating: p.rating, maxRating: p.rating });
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stars" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0e1012" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" style={{ fill: 'var(--text)', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {vendors.length > 0 && (
              <div className="chart-card">
                <h2>Average rating by vendor</h2>
                {byVendor.length === 0 ? (
                  <p className="muted">No reviews in this range yet.</p>
                ) : (
                  <>
                    <p className="chart-hint muted">Click a row to see that vendor's reviews.</p>
                    <ResponsiveContainer width="100%" height={Math.max(180, byVendor.length * 36)}>
                      <BarChart
                        data={byVendor}
                        layout="vertical"
                        margin={{ left: 20, right: 45 }}
                        style={{ cursor: 'pointer' }}
                        onClick={(state) => {
                          const p = state?.activePayload?.[0]?.payload;
                          if (p) goToReviews({ vendorId: p.vendorId });
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 5]} />
                        <YAxis type="category" dataKey="vendorId" width={90} />
                        <Tooltip formatter={(value, name) => (name === 'avgRating' ? [value, 'Avg rating'] : [value, 'Reviews'])} />
                        <Bar dataKey="avgRating" fill="#fb2c36" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="avgRating" position="right" style={{ fill: 'var(--text)', fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>
            )}

            <div className="chart-card chart-card-wide">
              <h2>Monthly trend — {year}</h2>
              <p className="chart-hint muted">Click a month to see that month's reviews.</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyChartData} onClick={handleMonthClick} style={{ cursor: 'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 5]} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="count" name="Reviews" stroke="#0e1012">
                    <LabelList dataKey="count" position="top" style={{ fill: '#0e1012', fontSize: 11, fontWeight: 600 }} />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="avgRating" name="Avg rating" stroke="#e7000b">
                    <LabelList dataKey="avgRating" position="bottom" style={{ fill: '#e7000b', fontSize: 11, fontWeight: 600 }} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h2>Yearly totals</h2>
            <p className="chart-hint muted">Click a year to see that year's reviews.</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Reviews</th>
                  <th>Average rating</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((y) => (
                  <tr
                    key={y.year}
                    className="row-clickable"
                    onClick={() => goToReviews({ startDate: `${y.year}-01-01`, endDate: `${y.year}-12-31` })}
                  >
                    <td>{y.year}</td>
                    <td>{y.count}</td>
                    <td>{y.avgRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
