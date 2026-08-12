

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AppLayout from './components/AppLayout';

import LoginPage                from './pages/auth/LoginPage';
import ResetPasswordDemandePage from './pages/auth/ResetPasswordDemandePage';
import ResetPasswordConfirmPage from './pages/auth/ResetPasswordConfirmPage';

import GestionUtilisateursPage from './pages/admin/GestionUtilisateursPage';
import GestionEquipementsPage  from './pages/admin/GestionEquipementsPage';
import AdminMonitoringPage     from './pages/admin/AdminMonitoringPage';
import AuditLogPage            from './pages/admin/AuditLogPage';
import InterventionsStagingPage from './pages/admin/InterventionsStagingPage';
import QrInterventionPage      from './pages/QrInterventionPage';

import ListeEquipementsPage           from './pages/responsable/ListeEquipementsPage';
import PlanificationPreventivePage    from './pages/responsable/PlanificationPreventivePage';
import ResponsableDashboardPage    from './pages/responsable/DashboardPage';
import PowerBIDashboardPage        from './pages/responsable/PowerBIDashboardPage';
import GestionPRCPage             from './pages/responsable/GestionPRCPage';
import MaintenancePredictivePage  from './pages/responsable/MaintenancePredictivePage';

import MesEquipementsPage       from './pages/technicien/MesEquipementsPage';
import TechnicienMonitoringPage from './pages/technicien/MonitoringPage';
import TechnicienDashboardPage  from './pages/technicien/DashboardPage';
import MesInterventionsPage    from './pages/technicien/MesInterventionsPage';
import VerificationsPage       from './pages/technicien/VerificationsPage';
import SeuilsPage              from './pages/technicien/SeuilsPage';
import ScanEauPage             from './pages/technicien/ScanEauPage';
import ScanElectricitePage     from './pages/technicien/ScanElecPage';
import ScanInterventionPage    from './pages/technicien/ScanInterventionPage';

import InterventionPubliquePage from './pages/InterventionPubliquePage';

const Dashboard = ({ titre, icone = '🔧' }) => (
  <div className="p-8 flex items-center justify-center min-h-full">
    <div className="text-center">
      <div className="text-7xl mb-4">{icone}</div>
      <h2 className="text-2xl font-bold text-gray-800">{titre}</h2>
      <p className="text-gray-500 mt-2 text-sm">Module en cours de developpement – Sprint suivant</p>
    </div>
  </div>
);

const NonAutorise = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="text-7xl font-bold text-red-400 mb-4">403</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Acces refuse</h2>
      <p className="text-gray-500 mb-6">Vous n avez pas les permissions pour cette page.</p>
      <a href="/login" className="px-6 py-3 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition">
        Retour connexion
      </a>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          
          <Route path="/login"                 element={<LoginPage />} />
          <Route path="/reset-password"        element={<ResetPasswordDemandePage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordConfirmPage />} />
          <Route path="/non-autorise"          element={<NonAutorise />} />

          
          <Route path="/admin" element={
            <PrivateRoute roles={['Administrateur']}>
              <AppLayout />
            </PrivateRoute>
          }>
            <Route path="utilisateurs"          element={<GestionUtilisateursPage />} />
            <Route path="equipements"           element={<GestionEquipementsPage />} />
            <Route path="monitoring"            element={<AdminMonitoringPage />} />
            <Route path="audit"                 element={<AuditLogPage />} />
            <Route path="qr-intervention"       element={<QrInterventionPage />} />
            <Route path="interventions-terrain" element={<InterventionsStagingPage />} />
            <Route path="interventions"         element={<PlanificationPreventivePage />} />
          </Route>

          
          <Route path="/responsable" element={
            <PrivateRoute roles={['Responsable', 'Administrateur']}>
              <AppLayout />
            </PrivateRoute>
          }>
            <Route path="dashboard"             element={<ResponsableDashboardPage />} />
            <Route path="equipements"           element={<ListeEquipementsPage />} />
            <Route path="interventions"         element={<PlanificationPreventivePage />} />
            <Route path="interventions-terrain" element={<InterventionsStagingPage />} />
            <Route path="qr-intervention"       element={<QrInterventionPage />} />
            <Route path="kpis"                  element={<PowerBIDashboardPage />} />
            <Route path="seuils"                element={<SeuilsPage />} />
            <Route path="prc"                   element={<GestionPRCPage />} />
            <Route path="maintenance-predictive" element={<MaintenancePredictivePage />} />
          </Route>

          
          <Route path="/technicien" element={
            <PrivateRoute roles={['Technicien', 'Administrateur', 'Responsable']}>
              <AppLayout />
            </PrivateRoute>
          }>
            <Route path="dashboard"     element={<TechnicienDashboardPage />} />
            <Route path="equipements"   element={<MesEquipementsPage />} />
            <Route path="monitoring"    element={<TechnicienMonitoringPage />} />
            <Route path="interventions" element={<MesInterventionsPage />} />
            <Route path="verifications" element={<VerificationsPage />} />
          </Route>

          
          <Route path="/scan/eau"          element={<ScanEauPage />} />
          <Route path="/scan/electricite"  element={<ScanElectricitePage />} />
          <Route path="/scan/intervention/:equipementId" element={<ScanInterventionPage />} />
          <Route path="/intervention/nouveau"            element={<InterventionPubliquePage />} />

          <Route path="/"  element={<Navigate to="/login" replace />} />
          <Route path="*"  element={<Navigate to="/login" replace />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
