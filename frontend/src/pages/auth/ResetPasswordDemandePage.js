import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../../api';

const ResetPasswordDemandePage = () => {
  const [email, setEmail]     = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authAPI.resetDemande(email);
      setMessage(res.data.message);
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Mot de passe oublie</h2>
        <p className="text-gray-500 text-sm mb-6">Un lien valable 30 min sera envoye a votre email.</p>

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            ✅ {message}
          </div>
        )}
        {erreur && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ⚠️ {erreur}
          </div>
        )}

        {!message && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required placeholder="votre@email.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-60">
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
          </form>
        )}

        <Link to="/login" className="block text-center text-sm text-blue-700 hover:underline mt-4">
          ← Retour a la connexion
        </Link>
      </div>
    </div>
  );
};

export default ResetPasswordDemandePage;
