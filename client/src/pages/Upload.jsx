import { useEffect, useRef, useState } from 'react';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [deletions, setDeletions] = useState([]);
  const [deletionsError, setDeletionsError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const fileInputRef = useRef(null);

  function loadHistory() {
    api.get('/uploads').then((res) => setHistory(res.data.uploads));
  }

  function loadDeletions() {
    api.get('/deletions').then((res) => setDeletions(res.data.rows));
  }

  useEffect(() => {
    loadHistory();
    loadDeletions();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleteUpload(upload) {
    const message =
      upload.activeCount > 0
        ? `Delete all ${upload.activeCount} active review${upload.activeCount === 1 ? '' : 's'} from "${upload.filename}"? You can restore them from Recently Deleted within 7 days.`
        : `This upload's reviews were already replaced by a later upload — there's nothing left to move to the trash. Remove "${upload.filename}" from this list?`;

    setConfirmAction({
      title: 'Delete this upload?',
      message,
      confirmLabel: 'Delete upload',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await api.delete(`/uploads/${upload.id}`);
          loadHistory();
          loadDeletions();
        } catch (err) {
          setError(err.response?.data?.error || 'Could not delete this upload.');
        }
      },
    });
  }

  async function handleRestore(deletion) {
    setDeletionsError('');
    try {
      await api.post(`/deletions/${deletion.id}/restore`);
      loadHistory();
      loadDeletions();
    } catch (err) {
      setDeletionsError(err.response?.data?.error || 'Could not restore this data.');
    }
  }

  function handlePurge(deletion) {
    setConfirmAction({
      title: 'Delete permanently?',
      message: `Permanently delete ${deletion.review_count} review${deletion.review_count === 1 ? '' : 's'} from "${deletion.description}"? This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      onConfirm: async () => {
        setConfirmAction(null);
        setDeletionsError('');
        try {
          await api.delete(`/deletions/${deletion.id}`);
          loadDeletions();
        } catch (err) {
          setDeletionsError(err.response?.data?.error || 'Could not permanently delete this data.');
        }
      },
    });
  }

  return (
    <div className="page">
      <h1>Upload daily reviews</h1>
      <p className="muted">
        Upload today's Excel export (.xlsx, .xls, or .csv). Recognized columns are matched automatically —
        first/last name, job ID (Dispatch ID), star rating, technician, vendor, address/city/state/zip,
        phone/email, date completed, and comments. Any extra columns (like Contract ID or Brand) are still
        saved alongside each review, just not shown on the main table. Rows without a date default to
        today's date. If your workbook has multiple sheets (e.g. pivot summaries), only the sheet named
        <strong> "Data" </strong> is imported — the others are ignored. Rows matching a job ID (or, without
        one, the same customer/technician/date/rating) already on file are treated as duplicates — the old
        version is automatically moved to Recently Deleted (reason: "Duplicate value") and the new data
        takes its place, so it's safe to re-upload a file that overlaps a previous one and you can still
        recover the old version within 7 days if that wasn't what you wanted.
      </p>

      <form className="upload-card" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
        <button type="submit" disabled={!file || submitting}>
          {submitting ? 'Uploading...' : 'Upload'}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="success-banner">
          <strong>{result.insertedCount}</strong> new review{result.insertedCount === 1 ? '' : 's'} added.
          {result.updatedCount > 0 && (
            <>
              {' '}
              <strong>{result.updatedCount}</strong> duplicate{result.updatedCount === 1 ? '' : 's'} already on file{' '}
              {result.updatedCount === 1 ? 'was' : 'were'} replaced with the new data — the old version
              {result.updatedCount === 1 ? '' : 's'} moved to Recently Deleted below.
            </>
          )}
          {result.unmappedHeaders?.length > 0 && (
            <div className="muted" style={{ marginTop: 6 }}>
              Columns saved as extra details (not shown on the main table): {result.unmappedHeaders.join(', ')}
            </div>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>Recent uploads</h2>
      <p className="muted">
        Found a bad upload? Delete it here — every review still active from that file moves to Recently
        Deleted below, where you have 7 days to restore it before it's gone for good. "Active now" can
        drop to 0 if a later upload replaced all of this one's reviews as duplicates — that's normal,
        and you can still clear the entry from this list.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Uploaded by</th>
            <th>When</th>
            <th>New rows</th>
            <th>Duplicates refreshed</th>
            <th>Active now</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {history.map((u) => (
            <tr key={u.id}>
              <td>{u.filename}</td>
              <td>{u.uploaded_by}</td>
              <td>{u.uploaded_at}</td>
              <td>{u.row_count}</td>
              <td>{u.updated_count}</td>
              <td>{u.activeCount}</td>
              <td>
                <button className="link-button danger" onClick={() => handleDeleteUpload(u)}>
                  Delete upload
                </button>
              </td>
            </tr>
          ))}
          {history.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No uploads yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: 32 }}>Recently deleted</h2>
      <p className="muted">
        Deleted uploads and reviews stay here for 7 days so you can undo a mistake, then are removed
        automatically. You can also delete something here permanently right away.
      </p>
      {deletionsError && <div className="error-banner">{deletionsError}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>What</th>
            <th>Reviews</th>
            <th>Reason</th>
            <th>Deleted by</th>
            <th>Deleted</th>
            <th>Recoverable for</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {deletions.map((d) => (
            <tr key={d.id}>
              <td>
                {d.reason === 'Duplicate value' ? '' : d.type === 'upload' ? 'Upload: ' : 'Review: '}
                {d.description}
              </td>
              <td>{d.review_count}</td>
              <td>{d.reason || 'Manual delete'}</td>
              <td>{d.deletedBy || 'System (automatic)'}</td>
              <td>{d.deleted_at}</td>
              <td>{d.daysRemaining} day{d.daysRemaining === 1 ? '' : 's'}</td>
              <td className="actions-cell">
                <button className="link-button" onClick={() => handleRestore(d)}>
                  Restore
                </button>
                <button className="link-button danger" onClick={() => handlePurge(d)}>
                  Delete permanently
                </button>
              </td>
            </tr>
          ))}
          {deletions.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                Nothing in the trash.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
