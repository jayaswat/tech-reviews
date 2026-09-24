import { useEffect, useState } from 'react';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingUser, setRemovingUser] = useState(null);

  function loadUsers() {
    api.get('/users').then((res) => setUsers(res.data.users));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/users', { username, password, role });
      setUsername('');
      setPassword('');
      setRole('viewer');
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create user');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRemove() {
    const id = removingUser.id;
    setRemovingUser(null);
    await api.delete(`/users/${id}`);
    loadUsers();
  }

  return (
    <div className="page">
      <h1>Team accounts</h1>
      <p className="muted">
        Admins can upload data and manage accounts. Viewers can browse reviews and analytics only.
      </p>

      <form className="upload-card" onSubmit={handleCreate} style={{ flexWrap: 'wrap' }}>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input
          type="password"
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={submitting}>
          Add account
        </button>
      </form>
      {error && <div className="error-banner">{error}</div>}

      <table className="data-table" style={{ marginTop: 24 }}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td>{u.created_at}</td>
              <td>
                {u.id !== currentUser.id && (
                  <button className="link-button danger" onClick={() => setRemovingUser(u)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {removingUser && (
        <ConfirmDialog
          title="Remove this account?"
          message={`Remove "${removingUser.username}"? They'll no longer be able to log in. Their past uploads and deletions stay on record.`}
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onCancel={() => setRemovingUser(null)}
        />
      )}
    </div>
  );
}
