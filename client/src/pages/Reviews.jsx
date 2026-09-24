import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import RatingStars from '../components/RatingStars';
import EditReviewModal from '../components/EditReviewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 25;

export default function Reviews() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') || '');
  const [tech, setTech] = useState(() => searchParams.get('tech') || '');
  const [vendorId, setVendorId] = useState(() => searchParams.get('vendorId') || '');
  const [minRating, setMinRating] = useState(() => searchParams.get('minRating') || '');
  const [maxRating, setMaxRating] = useState(() => searchParams.get('maxRating') || '');
  const [q, setQ] = useState('');
  const [techs, setTechs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [editingReview, setEditingReview] = useState(null);
  const [deletingReview, setDeletingReview] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get('/techs').then((res) => setTechs(res.data.techs));
    api.get('/vendors').then((res) => setVendors(res.data.vendors));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page, pageSize: PAGE_SIZE };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (tech) params.tech = tech;
    if (vendorId) params.vendorId = vendorId;
    if (minRating) params.minRating = minRating;
    if (maxRating) params.maxRating = maxRating;
    if (q) params.q = q;

    api.get('/reviews', { params }).then((res) => {
      setRows(res.data.rows);
      setTotal(res.data.total);
      setLoading(false);
    });
  }, [page, startDate, endDate, tech, vendorId, minRating, maxRating, q]);

  function resetToFirstPage(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  function handleMinRatingChange(value) {
    setMaxRating(''); // picking a min rating manually means "X and up", not an exact match
    resetToFirstPage(setMinRating)(value);
  }

  function clearFilters() {
    setStartDate('');
    setEndDate('');
    setTech('');
    setVendorId('');
    setMinRating('');
    setMaxRating('');
    setQ('');
    setPage(1);
  }

  async function confirmDelete() {
    const id = deletingReview.id;
    setDeletingReview(null);
    await api.delete(`/reviews/${id}`);
    setRows((rows) => rows.filter((r) => r.id !== id));
    setTotal((t) => t - 1);
  }

  function handleSaved(updatedRow) {
    setRows((rows) => rows.map((r) => (r.id === updatedRow.id ? updatedRow : r)));
    setEditingReview(null);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (tech) params.tech = tech;
      if (vendorId) params.vendorId = vendorId;
      if (minRating) params.minRating = minRating;
      if (maxRating) params.maxRating = maxRating;
      if (q) params.q = q;

      const res = await api.get('/reviews/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `reviews-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeFilters = [];
  if (tech) activeFilters.push(`technician ${tech}`);
  if (vendorId) activeFilters.push(`vendor ${vendorId}`);
  if (minRating && maxRating && minRating === maxRating) activeFilters.push(`exactly ${minRating}★`);
  else if (minRating) activeFilters.push(`${minRating}+ stars`);
  if (startDate || endDate) activeFilters.push(`${startDate || 'any date'} to ${endDate || 'any date'}`);
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="page">
      <h1>Reviews</h1>

      <div className="filter-bar">
        <label>
          From
          <input type="date" value={startDate} onChange={(e) => resetToFirstPage(setStartDate)(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} onChange={(e) => resetToFirstPage(setEndDate)(e.target.value)} />
        </label>
        <label>
          Technician
          <select value={tech} onChange={(e) => resetToFirstPage(setTech)(e.target.value)}>
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
            <select value={vendorId} onChange={(e) => resetToFirstPage(setVendorId)(e.target.value)}>
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
          Min rating
          <select value={minRating} onChange={(e) => handleMinRatingChange(e.target.value)}>
            <option value="">Any</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r}+ stars
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="text"
            placeholder="Name, job ID, address..."
            value={q}
            onChange={(e) => resetToFirstPage(setQ)(e.target.value)}
          />
        </label>
        <div className="filter-bar-actions">
          <span className="filter-bar-actions-label">Export</span>
          <button type="button" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Preparing...' : 'Download (.xlsx)'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="page-loading">Loading reviews...</div>
      ) : (
        <>
          <p className="muted">
            {total} review{total === 1 ? '' : 's'} found
            {hasActiveFilters && (
              <>
                {' '}
                — filtered by {activeFilters.join(', ')}.{' '}
                <button className="link-button" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            )}
          </p>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Job ID</th>
                  <th>Technician</th>
                  {vendors.length > 0 && <th>Vendor</th>}
                  <th>Rating</th>
                  <th>Address</th>
                  <th>Contact</th>
                  <th>Comments</th>
                  {user.role === 'admin' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.review_date}</td>
                    <td>
                      {r.customer_first_name} {r.customer_last_name}
                    </td>
                    <td>{r.job_id}</td>
                    <td>{r.tech_name}</td>
                    {vendors.length > 0 && <td>{r.vendor_id}</td>}
                    <td>
                      <RatingStars rating={r.star_rating} />
                    </td>
                    <td>{r.address}</td>
                    <td>{r.contact}</td>
                    <td className="truncate" title={r.review_text}>
                      {r.review_text}
                    </td>
                    {user.role === 'admin' && (
                      <td className="actions-cell">
                        <button className="link-button" onClick={() => setEditingReview(r)}>
                          Edit
                        </button>
                        <button className="link-button danger" onClick={() => setDeletingReview(r)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted">
                      No reviews match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}

      {editingReview && (
        <EditReviewModal review={editingReview} onClose={() => setEditingReview(null)} onSaved={handleSaved} />
      )}

      {deletingReview && (
        <ConfirmDialog
          title="Delete this review?"
          message={`Delete the review from ${deletingReview.customer_first_name} ${deletingReview.customer_last_name}? You can restore it from Recently Deleted (on the Upload page) within 7 days.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingReview(null)}
        />
      )}
    </div>
  );
}
