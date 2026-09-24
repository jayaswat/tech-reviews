import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ChatWidget from './components/ChatWidget';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Reviews from './pages/Reviews';
import Upload from './pages/Upload';
import Users from './pages/Users';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user } = useAuth();
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reviews"
          element={
            <ProtectedRoute>
              <Reviews />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute adminOnly>
              <Upload />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <Users />
            </ProtectedRoute>
          }
        />
      </Routes>
      {user && <ChatWidget />}
    </>
  );
}
