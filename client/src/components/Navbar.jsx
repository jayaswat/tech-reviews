import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img src="/swat-logo.webp" alt="S.W.A.T. Plumbing LLC" className="navbar-logo" />
        Tech Reviews
      </div>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/reviews" className={({ isActive }) => (isActive ? 'active' : '')}>
          Reviews
        </NavLink>
        {user.role === 'admin' && (
          <>
            <NavLink to="/upload" className={({ isActive }) => (isActive ? 'active' : '')}>
              Upload
            </NavLink>
            <NavLink to="/users" className={({ isActive }) => (isActive ? 'active' : '')}>
              Users
            </NavLink>
          </>
        )}
      </div>
      <div className="navbar-user">
        <span>
          {user.username} <em>({user.role})</em>
        </span>
        <button onClick={handleLogout}>Log out</button>
      </div>
    </nav>
  );
}
