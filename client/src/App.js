import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import Upload from './pages/Upload';
import Records from './pages/Records';
import RecordDetail from './pages/RecordDetail';
import LabAnalytics from './pages/LabAnalytics';
import Navigation from './components/Navigation';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const { isAuthenticated, loading, isAdmin } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated && <Navigation />}
      <main className={isAuthenticated ? 'pt-16' : ''}>
        <Routes>
          <Route 
            path="/login" 
            element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} 
          />
          <Route 
            path="/register" 
            element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />} 
          />
          <Route 
            path="/forgot-password" 
            element={isAuthenticated ? <Navigate to="/dashboard" /> : <ForgotPassword />} 
          />
          <Route 
            path="/admin" 
            element={isAuthenticated && isAdmin ? <AdminDashboard /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/dashboard" 
            element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/upload" 
            element={isAuthenticated ? <Upload /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/records" 
            element={isAuthenticated ? <Records /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/records/:id" 
            element={isAuthenticated ? <RecordDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/lab-analytics" 
            element={isAuthenticated ? <LabAnalytics /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/" 
            element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} 
          />
        </Routes>
      </main>
    </div>
  );
}

export default App; 