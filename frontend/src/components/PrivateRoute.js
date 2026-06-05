// ============================================================
// PRIVATE ROUTE - Protection des pages par role
// ============================================================
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PrivateRoute = ({ children, roles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
    </div>
  );

  if (!user) {
    const from = location.pathname !== '/login' ? location.pathname : null;
    return <Navigate to={from ? `/login?redirect=${from}` : '/login'} replace />;
  }
  if (roles.length > 0 && !roles.includes(user.role)) return <Navigate to="/non-autorise" replace />;
  return children;
};

export default PrivateRoute;
