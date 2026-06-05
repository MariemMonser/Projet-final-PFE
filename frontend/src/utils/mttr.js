// ============================================================
// CALCUL MTTR (Mean Time To Repair)
// Partagé entre InterventionsStagingPage et MesInterventionsPage
// ============================================================

export const calculerMTTR = (dateOuv, heureOuv, dateClo, heureClo) => {
  if (!dateOuv || !heureOuv || !dateClo || !heureClo) return null;
  const d1 = new Date(dateOuv).toISOString().split('T')[0];
  const d2 = new Date(dateClo).toISOString().split('T')[0];
  const ouv = new Date(`${d1}T${heureOuv}:00`);
  const clo = new Date(`${d2}T${heureClo}:00`);
  const diffMs = clo - ouv;
  if (diffMs <= 0) return null;
  const totalMin = Math.round(diffMs / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};
