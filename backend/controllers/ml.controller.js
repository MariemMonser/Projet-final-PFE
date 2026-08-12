const fs             = require('fs');
const path           = require('path');
const { spawn }      = require('child_process');

// Parser CSV minimal : gère BOM, guillemets et virgules dans les champs
function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = []; let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').replace(/^"|"$/g, '')]));
  });
}

const DATA_DIR        = path.join(__dirname, '..', '..', 'DATA');
const PREDICTIONS_CSV = path.join(DATA_DIR, 'ml_output', 'predictions_risque.csv');
const MODEL_META_JSON  = path.join(DATA_DIR, 'ml_output', 'model_meta.json');

// In-memory job state (single-server process — sufficient for this use case)
let retrainJob = { status: 'idle', startedAt: null, finishedAt: null, error: null, log: [] };

// Lit le CSV et retourne les prédictions + statistiques de risque
const getPredictions = (req, res) => {
  if (!fs.existsSync(PREDICTIONS_CSV)) {
    return res.status(404).json({
      message: 'Fichier de prédictions introuvable. Lancez retrain_model.py pour générer les prédictions.',
      predictions: [],
      stats: { eleve: 0, modere: 0, faible: 0, total: 0 },
    });
  }

  try {
    const raw  = fs.readFileSync(PREDICTIONS_CSV, 'utf-8');
    const rows = parseCSV(raw);

    // Normaliser les types
    const predictions = rows.map(r => ({
      code_equipement:  r.code_equipement  || '',
      libelle:          r.libelle          || r.code_equipement || '',
      annee_mois:       r.annee_mois       || '',
      proba_panne:      parseFloat(r.proba_panne)   || 0,
      risque:           r.risque           || 'Faible',
      nb_cura_roll3:    parseFloat(r.nb_cura_roll3)  || 0,
      nb_prev_roll3:    parseFloat(r.nb_prev_roll3)  || 0,
      mois_depuis_cura: parseFloat(r.mois_depuis_cura) ?? null,
      mois_depuis_prev: parseFloat(r.mois_depuis_prev) ?? null,
    }));

    // Trier par probabilité décroissante
    predictions.sort((a, b) => b.proba_panne - a.proba_panne);

    const stats = {
      eleve:  predictions.filter(p => p.risque === 'Élevé').length,
      modere: predictions.filter(p => p.risque === 'Modéré').length,
      faible: predictions.filter(p => p.risque === 'Faible').length,
      total:  predictions.length,
    };

    // Métadonnées du modèle si disponibles
    let modelInfo = null;
    if (fs.existsSync(MODEL_META_JSON)) {
      try { modelInfo = JSON.parse(fs.readFileSync(MODEL_META_JSON, 'utf-8')); } catch (_) {}
    }

    const stat     = fs.statSync(PREDICTIONS_CSV);
    const ageJours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    const freshness = {
      stale:        ageJours > 30,
      age_jours:    Math.round(ageJours),
      last_updated: stat.mtime,
    };

    res.json({ predictions, stats, modelInfo, freshness });
  } catch (err) {
    console.error('[ML] Erreur lecture prédictions:', err.message);
    res.status(500).json({ message: 'Erreur lors de la lecture des prédictions.' });
  }
};

const triggerRetrain = (req, res) => {
  if (retrainJob.status === 'running') {
    return res.status(409).json({ message: 'Un entraînement est déjà en cours.', job: retrainJob });
  }

  retrainJob = { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, error: null, log: [] };
  res.status(202).json({ message: 'Entraînement lancé.', job: retrainJob });

  const script = path.join(DATA_DIR, 'retrain_model.py');
  const proc   = spawn('python', [script], { cwd: DATA_DIR });

  proc.stdout.on('data', d => {
    const line = d.toString().trim();
    if (line) retrainJob.log.push(line);
  });

  proc.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line) retrainJob.log.push(`[ERR] ${line}`);
  });

  proc.on('close', code => {
    retrainJob.finishedAt = new Date().toISOString();
    retrainJob.status     = code === 0 ? 'done' : 'error';
    if (code !== 0) retrainJob.error = `Script terminé avec le code ${code}.`;
  });

  proc.on('error', err => {
    retrainJob.status     = 'error';
    retrainJob.finishedAt = new Date().toISOString();
    retrainJob.error      = err.message;
  });
};

const getRetrainStatus = (req, res) => {
  res.json({ job: retrainJob });
};

module.exports = { getPredictions, triggerRetrain, getRetrainStatus };
