export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card modal-card-small" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
