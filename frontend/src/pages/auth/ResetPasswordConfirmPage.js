import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../api';

const ResetPasswordConfirmPage = () => {
  const { token }             = useParams();
  const navigate              = useNavigate();
  const [mdp, setMdp]         = useState('');
  const [confirm, setConfirm] = useState('');
  const [erreur, setErreur]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mdp !== confirm) return setErreur('Les mots de passe ne correspondent pas.');
    if (mdp.length < 8)  return setErreur('Mot de passe minimum 8 caracteres.');
    setLoading(true);
    try {
      await authAPI.resetConfirm(token, mdp);
      navigate('/login');
    } catch (err) {
      setErreur(err.response?.data?.message || 'Lien invalide ou expire.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Nouveau mot de passe</h2>

        {erreur && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ⚠️ {erreur}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
            <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)}
              required placeholder="Minimum 8 caracteres"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              required placeholder="Repeter le mot de passe"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-60">
            {loading ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
          </button>
        </form>

        <Link to="/login" className="block text-center text-sm text-blue-700 hover:underline mt-4">
          ← Retour a la connexion
        </Link>
      </div>
    </div>
  );
};

export default ResetPasswordConfirmPage;
