

export const validerNom = (valeur, label = 'Ce champ') => {
  if (!valeur || !valeur.trim()) return `${label} est obligatoire.`;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s\-]+$/.test(valeur.trim()))
    return `${label} : lettres, espaces et tirets uniquement (pas de chiffres ni caractères spéciaux).`;
  return null;
};

export const validerEmail = (valeur) => {
  if (!valeur || !valeur.trim()) return "L'email est obligatoire.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valeur.trim()))
    return "Format d'email invalide.";
  return null;
};

export const validerMotDePasse = (valeur, obligatoire = true) => {
  if (!valeur || !valeur.trim()) {
    return obligatoire ? 'Le mot de passe est obligatoire.' : null;
  }
  if (valeur.length < 8) return 'Minimum 8 caractères requis.';
  if (!/[A-Z]/.test(valeur)) return 'Au moins 1 lettre majuscule requise.';
  if (!/[a-z]/.test(valeur)) return 'Au moins 1 lettre minuscule requise.';
  if (!/[0-9]/.test(valeur)) return 'Au moins 1 chiffre requis.';
  if (!/[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(valeur))
    return 'Au moins 1 caractère spécial requis (ex: @, #, !).';
  return null;
};

export const validerNumerique = (valeur, label = 'Ce champ', options = {}) => {
  const { obligatoire = true, min = 0 } = options;
  if (valeur === '' || valeur === null || valeur === undefined) {
    return obligatoire ? `${label} est obligatoire.` : null;
  }
  const num = parseFloat(valeur);
  if (isNaN(num)) return `${label} doit être un nombre.`;
  if (num < min) return `${label} ne peut pas être inférieur à ${min}.`;
  return null;
};

export const validerDate = (valeur, label = 'La date') => {
  if (!valeur) return `${label} est obligatoire.`;
  return null;
};

export const validerSelectObligatoire = (valeur, label = 'Ce champ') => {
  if (!valeur) return `${label} est obligatoire.`;
  return null;
};

export const validerFormulaire = (regles) => {
  const erreurs = {};
  let valide = true;
  for (const [champ, erreur] of Object.entries(regles)) {
    if (erreur) {
      erreurs[champ] = erreur;
      valide = false;
    }
  }
  return { valide, erreurs };
};
