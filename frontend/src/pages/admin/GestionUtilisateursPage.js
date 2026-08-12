

import React, { useState, useEffect } from 'react';
import { usersAPI } from '../../api';
import {
  validerNom,
  validerEmail,
  validerMotDePasse,
  validerFormulaire,
} from '../../utils/validators';

const ROLES = ['Administrateur', 'Responsable', 'Technicien'];

const ROLE_COLORS = {
  Administrateur: 'bg-red-100 text-red-800',
  Responsable:    'bg-blue-100 text-blue-800',
  Technicien:     'bg-green-100 text-green-800',
};

const initForm = { nom: '', prenom: '', email: '', mot_de_passe: '', role: 'Technicien' };

const FieldError = ({ erreur }) =>
  erreur ? <p className="text-red-600 text-xs mt-1">{erreur}</p> : null;

const GestionUtilisateursPage = () => {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]         = useState(initForm);
  const [erreurs, setErreurs]   = useState({});
  const [erreurGlobal, setErreurGlobal] = useState('');
  const [formLoading, setFormLoading]   = useState(false);
  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('');
  const [openActions, setOpenActions]   = useState(null);
  const [deleteUser, setDeleteUser]     = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const chargerUsers = async () => {
    try {
      const res = await usersAPI.getAll();
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { chargerUsers(); }, []);

  useEffect(() => {
    if (!openActions) return;
    const close = () => setOpenActions(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openActions]);

  const validerForm = (pourCreation) => {
    const { valide, erreurs: e } = validerFormulaire({
      prenom: validerNom(form.prenom, 'Le prénom'),
      nom:    validerNom(form.nom, 'Le nom'),
      email:  validerEmail(form.email),
      mot_de_passe: validerMotDePasse(form.mot_de_passe, pourCreation),
      role:   !form.role ? 'Le rôle est obligatoire.' : null,
    });
    setErreurs(e);
    return valide;
  };

  const ouvrirCreer = () => {
    setEditUser(null);
    setForm(initForm);
    setErreurs({});
    setErreurGlobal('');
    setModal(true);
  };

  const ouvrirModifier = (user) => {
    setOpenActions(null);
    setEditUser(user);
    setForm({ nom: user.nom, prenom: user.prenom, email: user.email, mot_de_passe: '', role: user.role });
    setErreurs({});
    setErreurGlobal('');
    setModal(true);
  };

  const sauvegarder = async (e) => {
    e.preventDefault();
    setErreurGlobal('');
    const pourCreation = !editUser;
    if (!validerForm(pourCreation)) return;

    setFormLoading(true);
    try {
      if (editUser) {
        const data = { ...form };
        if (!data.mot_de_passe) delete data.mot_de_passe;
        await usersAPI.update(editUser.id, data);
      } else {
        await usersAPI.create(form);
      }
      setModal(false);
      chargerUsers();
      setNotification({ type: 'success', text: editUser ? 'Utilisateur modifié avec succès.' : 'Utilisateur créé avec succès.' });
    } catch (err) {
      const msg = err.response?.data?.message || 'Erreur lors de la sauvegarde.';
      if (msg.toLowerCase().includes('email')) {
        setErreurs(prev => ({ ...prev, email: msg }));
      } else {
        setErreurGlobal(msg);
      }
    } finally {
      setFormLoading(false);
    }
  };

  const desactiver = async (user) => {
    setOpenActions(null);
    if (!window.confirm(`Désactiver le compte de ${user.prenom} ${user.nom} ?`)) return;
    try {
      await usersAPI.desactiver(user.id);
      setNotification({ type: 'success', text: 'Compte désactivé avec succès.' });
      chargerUsers();
    } catch (err) {
      setNotification({ type: 'error', text: err.response?.data?.message || 'Erreur lors de la désactivation.' });
    }
  };

  const ouvrirSuppression = (user) => {
    setOpenActions(null);
    setDeleteUser(user);
    setNotification(null);
  };

  const confirmerSuppression = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      await usersAPI.delete(deleteUser.id);
      setNotification({ type: 'success', text: `Le compte de ${deleteUser.prenom} ${deleteUser.nom} a été supprimé.` });
      setDeleteUser(null);
      chargerUsers();
    } catch (err) {
      setNotification({ type: 'error', text: err.response?.data?.message || 'Erreur lors de la suppression.' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const forcerDeconnexion = async (user) => {
    setOpenActions(null);
    if (!window.confirm(`Forcer la déconnexion de ${user.prenom} ${user.nom} ?`)) return;
    try {
      await usersAPI.forcerDeconnexion(user.id);
      setNotification({ type: 'success', text: 'Utilisateur déconnecté de force.' });
    } catch (err) {
      setNotification({ type: 'error', text: err.response?.data?.message || 'Erreur lors de la déconnexion forcée.' });
    }
  };

  const filtres = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${u.nom} ${u.prenom} ${u.email}`.toLowerCase().includes(q);
    const matchRole   = !filterRole || u.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <div className="p-6">

      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des Utilisateurs</h1>
          <p className="text-gray-500 text-sm mt-1">{users.length} compte(s) enregistré(s)</p>
        </div>
        <button onClick={ouvrirCreer}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition font-medium">
          + Nouvel utilisateur
        </button>
      </div>

      
      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="🔍 Rechercher nom, email..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"/>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {notification && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${
          notification.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {notification.text}
        </div>
      )}

      
      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-visible">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900"></div>
          </div>
        ) : (
          <div className="overflow-visible">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left w-[24%]">Utilisateur</th>
                  <th className="px-5 py-3 text-left w-[27%]">Email</th>
                  <th className="px-5 py-3 text-left w-[15%]">Rôle</th>
                  <th className="px-5 py-3 text-left w-[13%]">Statut</th>
                  <th className="px-5 py-3 text-left w-[11%]">Créé le</th>
                  <th className="px-5 py-3 text-right w-[10%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtres.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                ) : filtres.map((u, idx) => {
                  const openUpward = idx >= filtres.length - 2;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-sm">
                            {u.prenom?.[0]}{u.nom?.[0]}
                          </div>
                          <span className="font-medium text-gray-900 truncate">{u.prenom} {u.nom}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 truncate">{u.email}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.est_actif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {u.est_actif ? '✅ Actif' : '❌ Désactivé'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {u.date_creation ? new Date(u.date_creation).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-5 py-3 text-right relative">
                        <div className="inline-flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpenActions(openActions === u.id ? null : u.id); }}
                            className="px-3 py-2 bg-blue-50 text-blue-900 rounded-lg text-xs font-semibold hover:bg-blue-100 transition border border-blue-100"
                          >
                            Actions ▾
                          </button>

                          {openActions === u.id && (
                            <div className={`absolute right-5 z-20 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-2 text-left ${openUpward ? 'bottom-10' : 'top-10'}`}>
                              <button type="button" onClick={() => ouvrirModifier(u)}
                                className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 text-left">
                                Modifier le compte
                              </button>
                              {u.est_actif && (
                                <button type="button" onClick={() => desactiver(u)}
                                  className="w-full px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 text-left">
                                  Désactiver le compte
                                </button>
                              )}
                              <button type="button" onClick={() => forcerDeconnexion(u)}
                                className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                                Forcer la déconnexion
                              </button>
                              <div className="my-1 border-t border-gray-100" />
                              <button type="button" onClick={() => ouvrirSuppression(u)}
                                className="w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50 text-left">
                                Supprimer définitivement
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {editUser ? 'Modifier utilisateur' : 'Créer un utilisateur'}
              </h2>
              <button onClick={() => setModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={sauvegarder} className="px-6 py-5 space-y-4" noValidate>
              {erreurGlobal && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  ⚠️ {erreurGlobal}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                  <input type="text" value={form.prenom}
                    onChange={(e) => { setForm({...form, prenom: e.target.value}); setErreurs(p => ({...p, prenom: null})); }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${erreurs.prenom ? 'border-red-400' : 'border-gray-300'}`}
                    placeholder="Ex: Ahmed"/>
                  <FieldError erreur={erreurs.prenom} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input type="text" value={form.nom}
                    onChange={(e) => { setForm({...form, nom: e.target.value}); setErreurs(p => ({...p, nom: null})); }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${erreurs.nom ? 'border-red-400' : 'border-gray-300'}`}
                    placeholder="Ex: Ben Ali"/>
                  <FieldError erreur={erreurs.nom} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={form.email}
                  onChange={(e) => { setForm({...form, email: e.target.value}); setErreurs(p => ({...p, email: null})); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${erreurs.email ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder="exemple@eleonetech.com"/>
                <FieldError erreur={erreurs.email} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editUser ? 'Mot de passe (vide = inchangé)' : 'Mot de passe *'}
                </label>
                <input type="password" value={form.mot_de_passe}
                  onChange={(e) => { setForm({...form, mot_de_passe: e.target.value}); setErreurs(p => ({...p, mot_de_passe: null})); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${erreurs.mot_de_passe ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder={editUser ? 'Laisser vide pour ne pas changer' : 'Min. 8 car., maj., min., chiffre, @#!...'}/>
                <FieldError erreur={erreurs.mot_de_passe} />
                {!editUser && !erreurs.mot_de_passe && (
                  <p className="text-xs text-gray-400 mt-1">Ex : Password@123 (8+ car., MAJ, min., chiffre, spécial)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle *</label>
                <select value={form.role}
                  onChange={(e) => { setForm({...form, role: e.target.value}); setErreurs(p => ({...p, role: null})); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${erreurs.role ? 'border-red-400' : 'border-gray-300'}`}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <FieldError erreur={erreurs.role} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm transition">
                  Annuler
                </button>
                <button type="submit" disabled={formLoading}
                  className="flex-1 py-2.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                  {formLoading ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Enregistrement...</>
                  ) : editUser ? '💾 Modifier' : '✅ Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {deleteUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Supprimer le compte</h2>
              <p className="text-sm text-gray-600 mt-1">
                Cette action est définitive pour {deleteUser.prenom} {deleteUser.nom}.
              </p>
            </div>
            <div className="px-6 py-5">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                Le compte, les sessions et l'historique audit lié seront supprimés.
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteUser(null)} disabled={deleteLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white text-sm">
                Annuler
              </button>
              <button type="button" onClick={confirmerSuppression} disabled={deleteLoading}
                className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 text-sm font-medium disabled:opacity-60">
                {deleteLoading ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionUtilisateursPage;
