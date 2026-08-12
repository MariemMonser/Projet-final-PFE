

import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api';

const MENUS = {
  Administrateur: [
    { path: '/admin/utilisateurs',          label: 'Utilisateurs',       icon: '👥' },
    { path: '/admin/equipements',           label: 'Équipements',        icon: '⚙️'  },
    { path: '/admin/monitoring',            label: 'Monitoring',         icon: '📊'  },
    { path: '/admin/interventions',         label: 'Planification',      icon: '📅' },
    { path: '/admin/interventions-terrain', label: 'Fiches terrain',     icon: '📋' },
    { path: '/admin/audit',                 label: "Journal d'audit",    icon: '🔍' },
  ],
  Responsable: [
    { path: '/responsable/dashboard',             label: 'Tableau de bord',      icon: '📊' },
    { path: '/responsable/equipements',           label: 'Equipements',          icon: '⚙️'  },
    { path: '/responsable/interventions',         label: 'Planification',        icon: '🔧' },
    { path: '/responsable/interventions-terrain', label: 'Fiches terrain',       icon: '📋' },
    { path: '/responsable/kpis',                  label: 'KPIs',                 icon: '📈' },
    { path: '/responsable/seuils',                label: 'Seuils et Alertes',    icon: '⚠️' },
    { path: '/responsable/prc',                   label: 'Pièces de rechange',   icon: '🔩' },
    { path: '/responsable/maintenance-predictive', label: 'Maintenance prédictive', icon: '🤖' },
  ],
  Technicien: [
    { path: '/technicien/dashboard',      label: 'Mon tableau de bord', icon: '📊' },
    { path: '/technicien/equipements',    label: 'Mes equipements',      icon: '⚙️'  },
    { path: '/technicien/monitoring',     label: 'Monitoring',           icon: '📊'  },
    { path: '/technicien/interventions',  label: 'Mes interventions',   icon: '🔧' },
    { path: '/technicien/verifications',  label: 'Verifications',       icon: '✅' },
  ],
};

const ROLE_COLORS = {
  Administrateur: 'bg-red-100 text-red-800',
  Responsable:    'bg-blue-100 text-blue-800',
  Technicien:     'bg-green-100 text-green-800',
};

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();
  const location          = useLocation();
  const menuItems         = MENUS[user?.role] || [];

  
  const currentPage = menuItems.find(m => location.pathname.startsWith(m.path));

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ ancien: '', nouveau: '', confirmation: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    
    if (passwordForm.nouveau !== passwordForm.confirmation) {
      return setPasswordError('Les nouveaux mots de passe ne correspondent pas.');
    }
    
    try {
      setPasswordLoading(true);
      await authAPI.changePassword({
        ancien_mot_de_passe: passwordForm.ancien,
        nouveau_mot_de_passe: passwordForm.nouveau
      });
      setPasswordSuccess('Mot de passe modifie avec succes !');
      setPasswordForm({ ancien: '', nouveau: '', confirmation: '' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 2000);
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Erreur lors de la modification.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      
      <aside className="w-64 bg-blue-950 text-white flex flex-col flex-shrink-0">

        
        <div className="px-6 py-5 border-b border-blue-900">
          <h1 className="text-xl font-bold tracking-wide">ELEONETECH</h1>
          <p className="text-blue-300 text-xs mt-0.5">Maintenance Batiment & Infrastructure</p>
        </div>

        
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink key={item.path} to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-200 hover:bg-blue-900 hover:text-white'
                }`
              }>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        
        <div className="border-t border-blue-900 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
              {user?.prenom?.[0]}{user?.nom?.[0]}
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-sm font-medium truncate">{user?.prenom} {user?.nom}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ROLE_COLORS[user?.role]}`}>
                {user?.role}
              </span>
            </div>
          </div>
          <button onClick={() => setShowPasswordModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-blue-200 hover:bg-blue-900 rounded-lg text-sm transition mb-1">
            🔑 <span>Modifier mot de passe</span>
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-blue-200 hover:bg-red-900 rounded-lg text-sm transition">
            🚪 <span>Deconnexion</span>
          </button>
        </div>
      </aside>

      
      <main className="flex-1 overflow-y-auto relative flex flex-col">

        
        <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-2 text-gray-700">
            {currentPage && (
              <>
                <span className="text-lg">{currentPage.icon}</span>
                <span className="font-semibold text-sm">{currentPage.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 border-l pl-3">
              <span className="font-medium text-gray-700">{user?.prenom} {user?.nom}</span>
            </div>
          </div>
        </header>

        
        <div className="flex-1">
          <Outlet />
        </div>

        
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-gray-900">Modifier mon mot de passe</h2>
                <button onClick={() => setShowPasswordModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>

              <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                {passwordError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    ⚠️ {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    ✅ {passwordSuccess}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ancien mot de passe *</label>
                  <input type="password" value={passwordForm.ancien}
                    onChange={(e) => setPasswordForm({...passwordForm, ancien: e.target.value})}
                    required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe *</label>
                  <input type="password" value={passwordForm.nouveau}
                    onChange={(e) => setPasswordForm({...passwordForm, nouveau: e.target.value})}
                    required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le nouveau mot de passe *</label>
                  <input type="password" value={passwordForm.confirmation}
                    onChange={(e) => setPasswordForm({...passwordForm, confirmation: e.target.value})}
                    required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"/>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowPasswordModal(false)}
                    className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition">
                    Annuler
                  </button>
                  <button type="submit" disabled={passwordLoading}
                    className="flex-1 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 text-sm font-medium disabled:opacity-60">
                    {passwordLoading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AppLayout;
