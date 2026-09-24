import { useState } from 'react';
import api from '../api';

export default function EditReviewModal({ review, onClose, onSaved }) {
  const [form, setForm] = useState({
    customer_first_name: review.customer_first_name || '',
    customer_last_name: review.customer_last_name || '',
    job_id: review.job_id || '',
    star_rating: review.star_rating ?? '',
    tech_name: review.tech_name || '',
    vendor_id: review.vendor_id || '',
    address: review.address || '',
    contact: review.contact || '',
    review_text: review.review_text || '',
    review_date: review.review_date || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.patch(`/reviews/${review.id}`, form);
      onSaved(res.data.row);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Edit review</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-grid">
          <label>
            First name
            <input value={form.customer_first_name} onChange={(e) => update('customer_first_name', e.target.value)} />
          </label>
          <label>
            Last name
            <input value={form.customer_last_name} onChange={(e) => update('customer_last_name', e.target.value)} />
          </label>
          <label>
            Job ID
            <input value={form.job_id} onChange={(e) => update('job_id', e.target.value)} />
          </label>
          <label>
            Date
            <input type="date" value={form.review_date} onChange={(e) => update('review_date', e.target.value)} required />
          </label>
          <label>
            Rating
            <select value={form.star_rating} onChange={(e) => update('star_rating', e.target.value)}>
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r} star{r === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Technician
            <input value={form.tech_name} onChange={(e) => update('tech_name', e.target.value)} />
          </label>
          <label>
            Vendor ID
            <input value={form.vendor_id} onChange={(e) => update('vendor_id', e.target.value)} />
          </label>
          <label>
            Contact
            <input value={form.contact} onChange={(e) => update('contact', e.target.value)} />
          </label>
          <label className="modal-span-2">
            Address
            <input value={form.address} onChange={(e) => update('address', e.target.value)} />
          </label>
          <label className="modal-span-2">
            Comments
            <textarea rows={3} value={form.review_text} onChange={(e) => update('review_text', e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
