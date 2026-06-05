// ============================================================
// NOTIFICATION BELL - Centre de notifications in-app
// Alertes seuil + fiches terrain + interventions planifiées
// ============================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { monitoringAPI } from '../api';

const SEVERITY_STYLES = {
  danger:  { bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    text: 'text-red-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  info:    { bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-400',   text: 'text-blue-700' },
};

const getLink = (item, role) => {
  if (role === 'Administrateur') return item.link_admin;
  if (role === 'Responsable')    return item.link_responsable;
  return item.link_technicien;
};

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "À l'instant";
  if (m < 60)  return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `Il y a ${d}j`;
};

const NotificationBell = () => {
  const { user }             = useAuth();
  const navigate             = useNavigate();
  const [open, setOpen]      = useState(false);
  const [items, setItems]    = useState([]);
  const [total, setTotal]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [seen, setSeen]      = useState(false);   // a-t-on ouvert le panel ?
  const dropRef              = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await monitoringAPI.getNotifications();
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (_) {}
  }, []);

  // Chargement initial + polling toutes les 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Fermer le dropdown en cliquant à l'extérieur
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = async () => {
    setOpen(prev => !prev);
    if (!open) {
      setSeen(true);
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
  };

  const handleClick = (item) => {
    const link = getLink(item, user?.role);
    setOpen(false);
    if (link) navigate(link);
  };

  // Badge : rouge si non vu, gris sinon
  const badgeColor = seen ? 'bg-gray-400' : 'bg-red-500';

  return (
    <div className="relative" ref={dropRef}>

      {/* Bouton cloche */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
        title="Notifications"
      >
        {/* Icône cloche SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Badge compteur */}
        {total > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-white text-[10px] font-bold ${badgeColor}`}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">

          {/* En-tête */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 text-sm">Notifications</span>
              {total > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {total}
                </span>
              )}
            </div>
            <button
              onClick={() => { fetchNotifications(); }}
              className="text-gray-400 hover:text-gray-600 text-xs"
              title="Actualiser"
            >
              ↻
            </button>
          </div>

          {/* Liste */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                Chargement...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <span className="text-3xl mb-2">🔔</span>
                <span className="text-sm">Aucune notification</span>
              </div>
            ) : (
              items.map((item) => {
                const st = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleClick(item)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition flex items-start gap-3`}
                  >
                    <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug line-clamp-2">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                          {item.type === 'alerte'     ? 'Seuil dépassé'   :
                           item.type === 'intervention' ? 'Fiche terrain'  :
                           'Planifiée'}
                        </span>
                        <span className="text-xs text-gray-400">{timeAgo(item.date)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Pied du panel */}
          {items.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-center">
              <button
                onClick={() => {
                  setOpen(false);
                  const link = user?.role === 'Technicien' ? '/technicien/seuils'
                             : user?.role === 'Responsable' ? '/responsable/interventions-terrain'
                             : '/admin/interventions-terrain';
                  navigate(link);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Voir tout →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
