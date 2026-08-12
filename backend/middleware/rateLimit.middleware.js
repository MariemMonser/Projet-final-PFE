
const WINDOW_MS  = 15 * 60 * 1000; // 15 minutes
const MAX_HITS   = 20;              // max tentatives par IP par fenêtre

const store = new Map();

// Purger les entrées expirées toutes les heures pour éviter les fuites mémoire
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now - entry.start > WINDOW_MS) store.delete(ip);
  }
}, 60 * 60 * 1000);

const loginRateLimit = (req, res, next) => {
  const ip  = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    store.set(ip, { start: now, count: 1 });
    return next();
  }

  if (entry.count >= MAX_HITS) {
    const waitMin = Math.ceil((WINDOW_MS - (now - entry.start)) / 60000);
    return res.status(429).json({
      message: `Trop de tentatives. Réessayez dans ${waitMin} minute(s).`,
    });
  }

  entry.count++;
  next();
};

module.exports = { loginRateLimit };
