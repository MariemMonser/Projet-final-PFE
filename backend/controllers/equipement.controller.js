

const db = require('../config/db');
const QRCode = require('qrcode');
const os = require('os');

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();

  
  const virtualKeywords = ['virtualbox', 'vmware', 'vethernet', 'loopback', 'pseudo', 'virtual', 'vbox'];

  
  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    if (virtualKeywords.some(k => lowerName.includes(k))) continue;

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.56.')) continue; 
        return iface.address;
      }
    }
  }

  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }

  return 'localhost';
};

const logAction = async (idUser, action, tableCible = null, ip = null) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id_user, action, table_cible, ip_address) VALUES ($1, $2, $3, $4)',
      [idUser, action, tableCible, ip]
    );
  } catch (err) {
    console.error('Erreur audit_log:', err.message);
  }
};

const getAll = async (req, res) => {
  try {
    const equipements = await db.query(`
      SELECT id, nom, famille_equipement
      FROM equipements
      ORDER BY nom ASC
    `);
    res.json(equipements.rows);
  } catch (err) {
    console.error('Erreur getAll equipements:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const equipements = await db.query(
      'SELECT id, nom, famille_equipement FROM equipements WHERE id = $1',
      [id]
    );

    if (equipements.rows.length === 0) {
      return res.status(404).json({ message: 'Équipement non trouvé.' });
    }

    res.json(equipements.rows[0]);
  } catch (err) {
    console.error('Erreur getById equipement:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const genererQrIntervention = async (req, res) => {
  const { id } = req.params;
  const { baseUrl } = req.query;

  try {
    const result = await db.query(
      'SELECT id, nom FROM equipements WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Equipement non trouve.' });
    }

    const equipement = result.rows[0];
    let appUrl = baseUrl || process.env.APP_URL || req.get('origin') || 'http://localhost:3000';
    
    
    if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      const localIp = getLocalIp();
      appUrl = appUrl.replace('localhost', localIp).replace('127.0.0.1', localIp);
    }
    
    const url = `${appUrl.replace(/\/$/, '')}/scan/intervention/${equipement.id}`;
    const qrCode = await QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    res.json({
      url,
      qrCode,
      equipement,
    });
  } catch (err) {
    console.error('Erreur genererQrIntervention:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const creer = async (req, res) => {
  const { nom, famille_equipement } = req.body;
  const ip = req.ip;

  if (!nom || nom.trim() === '') {
    return res.status(400).json({ message: 'Le nom de l\'équipement est requis.' });
  }

  try {
    const existing = await db.query('SELECT id FROM equipements WHERE nom = $1', [nom.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Un équipement avec ce nom existe déjà.' });
    }

    const result = await db.query(
      'INSERT INTO equipements (nom, famille_equipement) VALUES ($1, $2) RETURNING id',
      [nom.trim(), famille_equipement?.trim() || null]
    );

    await logAction(req.user.id, 'CREATE_EQUIPEMENT', 'equipements', ip);

    res.status(201).json({
      message: 'Équipement créé avec succès.',
      equipement: { id: result.rows[0].id, nom: nom.trim(), famille_equipement: famille_equipement?.trim() || null }
    });
  } catch (err) {
    console.error('Erreur creer equipement:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const modifier = async (req, res) => {
  const { id } = req.params;
  const { nom, famille_equipement } = req.body;
  const ip = req.ip;

  if (!nom || nom.trim() === '') {
    return res.status(400).json({ message: 'Le nom de l\'équipement est requis.' });
  }
  
  try {
    
    const existing = await db.query(
      'SELECT id FROM equipements WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Équipement non trouvé.' });
    }
    
    
    const duplicate = await db.query(
      'SELECT id FROM equipements WHERE nom = $1 AND id != $2',
      [nom.trim(), id]
    );
    
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ message: 'Un équipement avec ce nom existe déjà.' });
    }
    
    await db.query(
      'UPDATE equipements SET nom = $1, famille_equipement = $2 WHERE id = $3',
      [nom.trim(), famille_equipement?.trim() || null, id]
    );

    await logAction(req.user.id, 'UPDATE_EQUIPEMENT', 'equipements', ip);

    res.json({
      message: 'Équipement mis à jour avec succès.',
      equipement: { id: parseInt(id), nom: nom.trim(), famille_equipement: famille_equipement?.trim() || null }
    });
  } catch (err) {
    console.error('Erreur modifier equipement:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const supprimer = async (req, res) => {
  const { id } = req.params;
  const ip = req.ip;
  
  try {
    
    const existing = await db.query(
      'SELECT id FROM equipements WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Équipement non trouvé.' });
    }
    
    
    
    
    
    
    
    await db.query('DELETE FROM equipements WHERE id = $1', [id]);
    
    await logAction(req.user.id, 'DELETE_EQUIPEMENT', 'equipements', ip);
    
    res.json({ message: 'Équipement supprimé avec succès.' });
  } catch (err) {
    console.error('Erreur supprimer equipement:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = {
  getAll,
  getById,
  genererQrIntervention,
  creer,
  modifier,
  supprimer
};
