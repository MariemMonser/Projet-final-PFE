// ============================================================
// GENERATE QR STICKERS - Run once: node generate_qr.js
// Utilise l'IP Wi-Fi locale automatiquement
// ============================================================
const QRCode = require('qrcode');
const path = require('path');
const os = require('os');

// ── Détection automatique de l'IP Wi-Fi réelle ───────────
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  const virtualKeywords = ['virtualbox', 'vmware', 'vethernet', 'loopback', 'pseudo', 'virtual', 'vbox'];

  // 1er passage : ignorer les adaptateurs virtuels
  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    if (virtualKeywords.some(k => lowerName.includes(k))) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }
  // Fallback
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

const LOCAL_IP = getLocalIp();
const BASE_URL = `http://${LOCAL_IP}:3000`;

const stickers = [
  {
    filename: 'sticker_eau.png',
    url: `${BASE_URL}/scan/eau`,
    label: 'Compteur Eau'
  },
  {
    filename: 'sticker_electricite.png',
    url: `${BASE_URL}/scan/electricite`,
    label: 'Compteur Electricite'
  },
];

async function generate() {
  console.log(`\n📡 IP locale détectée : ${LOCAL_IP}`);
  console.log(`🌐 BASE_URL : ${BASE_URL}\n`);

  for (const sticker of stickers) {
    const filepath = path.join(__dirname, sticker.filename);
    await QRCode.toFile(filepath, sticker.url, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    console.log(`✅ Généré : ${sticker.filename}`);
    console.log(`   → URL  : ${sticker.url}`);
  }

  console.log('\n✅ Stickers QR générés dans le dossier backend/');
  console.log('📱 Scannez-les depuis un téléphone sur le même Wi-Fi.');
}

generate();
