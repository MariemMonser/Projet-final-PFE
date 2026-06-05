// ============================================================
// PAGE LOGIN
// ============================================================
import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Redirection selon le role apres connexion
const DASHBOARDS = {
  Administrateur: '/admin/utilisateurs',
  Responsable:    '/responsable/dashboard',
  Technicien:     '/technicien/dashboard',
  Lecteur:        '/lecteur/dashboard',
};

const LoginPage = () => {
  const [email, setEmail]     = useState('');
  const [mdp, setMdp]         = useState('');
  const [erreur, setErreur]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showMdp, setShowMdp] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

 const handleSubmit = async (e) => {
  e.preventDefault();
  setErreur('');
  setLoading(true);
  try {
    const user = await login(email, mdp);
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect');
    navigate((redirect && redirect !== '/login') ? redirect : (DASHBOARDS[user.role] || '/login'));
  } catch (err) {
    setErreur(err.response?.data?.message || 'Erreur de connexion.');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-blue-900 px-8 py-7 text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <span className="text-blue-900 text-3xl font-black">E</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-wide">ELEONETECH</h1>
          <p className="text-blue-200 text-sm mt-1">Gestion de Maintenance</p>
        </div>

        {/* Formulaire */}
        <div className="px-8 py-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Connexion</h2>

          {erreur && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2">
              <span>⚠️</span><span>{erreur}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="votre@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showMdp ? 'text' : 'password'}
                  value={mdp}
                  onChange={(e) => setMdp(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 pr-12"
                />
                <button type="button" onClick={() => setShowMdp(!showMdp)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showMdp ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="text-right">
              <Link to="/reset-password" className="text-sm text-blue-700 hover:underline">
                Mot de passe oublie ?
              </Link>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-900 hover:bg-blue-800 text-white font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Connexion...</>
              ) : '🔐 Se connecter'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            Administrateur · Responsable · Technicien · Lecteur
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
