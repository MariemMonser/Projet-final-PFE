const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const fs        = require("fs");
const path      = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const PDF_DIR    = "./Divers";
const OUTPUT_CSV = "./output/charges_employes.csv";

// Colonnes x validées sur les PDF de charges employés.
const COL_EQUIP_MIN  = 140;
const COL_EQUIP_MAX  = 258;
const COL_DESC_MAX   = 413;
const COL_TIME_MAX   = 530;
const COL_EMP_NAME_X = 530;
const COL_EMP_MAT    = 30;

// Positions x exactes des 10 chars de la date JJ/MM/AAAA
const DATE_X_BASE    = [413.0, 418.6, 424.1, 426.9, 432.5,
                        438.0, 440.8, 446.4, 451.9, 457.5];
const DATE_SLASH_IDX = new Set([2, 5]);

const RE_OT_NUM     = /^20\d{8}$/;
const RE_OT_FUSED   = /^(20\d{8})(.+)$/;
const RE_DATE       = /^\d{2}\/\d{2}\/\d{4}$/;
const RE_HOURS      = /^\d+,\d+$/;
const RE_MAT        = /^\d{4}$/;
const RE_DATE_FUSED = /\d{2}\/\d{2}\/\d{4}.*$/;

// Motifs de code équipement connus, recherchés en fin de chaîne — utilisé
// uniquement quand pdfjs a fusionné intervention + code en un seul token
// (cas RE_OT_FUSED), sans espace garanti entre le mot précédent et le code
// (ex: "pcbEOT010019", "étiquetteVAL-F-18").
// Essayés dans l'ordre : préfixes connus d'abord (précis), motif générique
// en dernier recours seulement (peut "manger" des lettres du mot précédent
// si tout est en majuscules, ex: "NETTOYEREOT010153").
const RE_EQUIP_TAIL_KNOWN = /(EOT-[A-Z]-\d{1,3}|EOT-?\d{3,7}|VAL-F-\d{1,3}|POSTE-\d{1,3}|TROLLEY-\d{1,3}|INF-[A-Z]+(?:-\d{1,3})?)\s*$/;
const RE_EQUIP_TAIL_GENERIC = /([A-Z]{2,5}\d{5,7})\s*$/;

function extractEquipTail(text) {
    const known = text.match(RE_EQUIP_TAIL_KNOWN);
    if (known) return known;
    return text.match(RE_EQUIP_TAIL_GENERIC);
}

const SKIP_WORDS = new Set(["OT","Matricule","Ligne","SITUATION",
                             "Charges","Mois","Entité","Page"]);

const HEADERS = ["id","matricule","nom_prenom","numero_ot","type_intervention",
                 "code_equipement","description_equipement","date_debut",
                 "hrs_travaux","periode_debut","periode_fin","annee",
                 "total_hrs_employe"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function frFloat(v) {
    if (v == null) return null;
    const f = parseFloat(String(v).replace(/\s/g, "").replace(",", ".").replace("%", ""));
    return isNaN(f) ? null : f;
}

/** Échappe une valeur pour CSV (guillemets si virgule, guillemet ou retour ligne) */
function csvCell(v) {
    const s = v == null ? "" : String(v);
    return (s.includes(",") || s.includes('"') || s.includes("\n"))
        ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Groupe les items pdfjs par ligne (même top ± tolY). */
function groupByRow(items, tolY = 3) {
    const rows = new Map();
    for (const item of items) {
        if (!item.str.trim()) continue;
        const x0  = item.transform[4];
        const top = item.transform[5];
        let found = null;
        for (const [rowY] of rows) {
            if (Math.abs(rowY - top) <= tolY) { found = rowY; break; }
        }
        const key = found ?? top;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x0, top, text: item.str.trim() });
    }
    for (const [, words] of rows)
        words.sort((a, b) => a.x0 - b.x0);
    // Trier du haut vers le bas (top décroissant car y est déjà inversé)
    return [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, words]) => words);
}

/** Extraction date par positions x de chars individuels — immunisée garbled. */
function extractDateChars(chars, top, tolY = 6) {
    const rowChars = chars.filter(c =>
        Math.abs(c.top - top) < tolY && c.x0 >= 410 && c.x0 <= 470);

    const slashes = rowChars
        .filter(c => c.text === "/" && c.x0 >= 418 && c.x0 <= 445)
        .sort((a, b) => a.x0 - b.x0);
    const offset = slashes.length >= 2 ? slashes[0].x0 - DATE_X_BASE[2] : 0;
    const dateX  = DATE_X_BASE.map(x => x + offset);

    const result = [];
    for (let i = 0; i < dateX.length; i++) {
        const xp      = dateX[i];
        const isSlash = DATE_SLASH_IDX.has(i);
        const matches = rowChars.filter(c => Math.abs(c.x0 - xp) < 1.2 && c.text.trim());

        if (!matches.length) {
            result.push(isSlash ? "/" : "?");
        } else {
            const best = matches.reduce((a, b) =>
                Math.abs(a.x0 - xp) <= Math.abs(b.x0 - xp) ? a : b);
            if (isSlash) {
                result.push("/");
            } else if (/\d/.test(best.text)) {
                result.push(best.text);
            } else {
                const dm = matches.filter(c => /\d/.test(c.text));
                result.push(dm.length
                    ? dm.reduce((a, b) => Math.abs(a.x0-xp) <= Math.abs(b.x0-xp) ? a : b).text
                    : "?");
            }
        }
    }
    const raw = result.join("");
    return RE_DATE.test(raw) ? raw : null;
}

/** Extraction heure HH:MM depuis chars x∈[465,530]. */
function extractTimeChars(chars, top, tolY = 6) {
    const raw = chars
        .filter(c => Math.abs(c.top - top) < tolY && c.x0 >= 465 && c.x0 <= 530)
        .sort((a, b) => a.x0 - b.x0)
        .map(c => c.text).join("");
    const m = raw.match(/\d{2}:\d{2}/);
    return m ? m[0] : "";
}

// ── Parseur PDF ───────────────────────────────────────────────────────────────

async function parsePdf(pdfPath) {
    const anneeMatch = path.basename(pdfPath).match(/202\d/);
    const annee      = anneeMatch ? parseInt(anneeMatch[0]) : null;

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc  = await pdfjsLib.getDocument({ data }).promise;

    let periodDebut = "", periodFin = "";
    let matricule = null, nom = null, totalHrs = null;
    const records = [];

    for (let p = 1; p <= doc.numPages; p++) {
        const page    = await doc.getPage(p);
        const content = await page.getTextContent();
        const vp      = page.getViewport({ scale: 1 });
        const pageH   = vp.height;

        // Convertir y pdfjs (origine bas-gauche) → top (origine haut-gauche)
        const items = content.items.map(it => ({
            str:       it.str,
            transform: [
                it.transform[0], it.transform[1],
                it.transform[2], it.transform[3],
                it.transform[4],               // x0
                pageH - it.transform[5],       // top (inversé)
            ],
        }));

        // Chars individuels avec y inversé
        const chars = items
            .filter(it => it.str.length === 1 && it.str.trim())
            .map(it => ({
                text: it.str,
                x0:   it.transform[4],
                top:  it.transform[5],
            }));

        // Extraire période depuis la première page
        if (!periodDebut) {
            const fullText = content.items.map(i => i.str).join(" ");
            const mDu = fullText.match(/Du\s+(\d{2}\/\d{2}\/\d{4})/);
            const mAu = fullText.match(/Au\s+(\d{2}\/\d{2}\/\d{4})/);
            if (mDu) periodDebut = mDu[1];
            if (mAu) periodFin   = mAu[1];
        }

        const rows = groupByRow(items);

        for (const row of rows) {
            if (!row.length) continue;
            const first     = row[0];
            const firstText = first.text;

            if (SKIP_WORDS.has(firstText)) continue;
            if (RE_DATE.test(firstText) && first.x0 < 80) continue;

            // ── En-tête employé ──────────────────────────────────────────────
            if (RE_MAT.test(firstText) && first.x0 < COL_EMP_MAT) {
                const nameWords = row
                    .filter(w => w.x0 > 50 && w.x0 < COL_EMP_NAME_X)
                    .map(w => w.text);
                const hrsWords  = row
                    .filter(w => w.x0 >= COL_EMP_NAME_X && RE_HOURS.test(w.text))
                    .map(w => w.text);
                if (nameWords.length) {
                    matricule = firstText.padStart(4, "0");
                    nom       = nameWords.join(" ");
                    totalHrs  = hrsWords.length ? frFloat(hrsWords[0]) : null;
                }
                continue;
            }

            // ── Ligne OT ─────────────────────────────────────────────────────
            let numero = null, intervFused = null;
            if (RE_OT_NUM.test(firstText)) {
                numero = firstText;
            } else {
                const mf = firstText.match(RE_OT_FUSED);
                if (mf) { numero = mf[1]; intervFused = mf[2].trim(); }
            }
            if (!numero || !matricule) continue;

            const interv = intervFused
                ? intervFused
                : row.filter(w => w.x0 >= 80 && w.x0 < COL_EQUIP_MIN)
                     .map(w => w.text).join(" ").trim() || "Intervention";

            const equipWord = row.find(w => w.x0 >= COL_EQUIP_MIN && w.x0 < COL_EQUIP_MAX);
            let equip = equipWord ? equipWord.text : "";
            let intervClean = interv;

            // Si la colonne équipement est vide, c'est très probablement parce que
            // pdfjs a fusionné le code équipement dans le texte d'intervention
            // (cas intervFused). On tente de le récupérer en fin de chaîne.
            if (!equip && intervFused) {
                const tailMatch = extractEquipTail(intervFused);
                if (tailMatch) {
                    equip = tailMatch[1];
                    intervClean = intervFused.slice(0, tailMatch.index).trim() || intervFused;
                }
            }

            const descWords = row
                .filter(w => w.x0 >= COL_EQUIP_MAX && w.x0 < COL_DESC_MAX)
                .map(w => w.text.replace(RE_DATE_FUSED, "").trim())
                .filter(Boolean);
            const desc = descWords.join(" ").trim() || equip;

            const top = first.top;
            let dateVal = null, timeVal = "";

            // pdfjs sometimes fuses description+date into one token starting at the desc column.
            // Search any token at x >= COL_EQUIP_MAX for a date pattern.
            for (const w of row.filter(r => r.x0 >= COL_EQUIP_MAX)) {
                if (!dateVal) {
                    const dm = w.text.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (dm) dateVal = dm[1];
                }
                if (!timeVal) {
                    const tm = w.text.match(/(\d{2}:\d{2})/);
                    if (tm) timeVal = tm[1];
                }
                if (dateVal && timeVal) break;
            }
            if (!dateVal) dateVal = extractDateChars(chars, top);
            if (!timeVal) timeVal = extractTimeChars(chars, top);
            if (!dateVal) { skipNoDate++; continue; }

            const hrsWord = row.find(w => w.x0 >= COL_TIME_MAX && RE_HOURS.test(w.text));
            const hrsVal  = hrsWord ? frFloat(hrsWord.text) : null;

            records.push({
                matricule,
                nom_prenom:             nom,
                numero_ot:              numero,
                type_intervention:      intervClean,
                code_equipement:        equip || null,
                description_equipement: desc,
                date_debut:             timeVal ? `${dateVal} ${timeVal}` : dateVal,
                hrs_travaux:            hrsVal,
                periode_debut:          periodDebut,
                periode_fin:            periodFin,
                annee,
                total_hrs_employe:      totalHrs,
            });
        }
    }
    return records;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const pdfs = fs.readdirSync(PDF_DIR)
        .filter(f => f.startsWith("Charges_employes") && f.endsWith(".pdf"))
        .sort()
        .map(f => path.join(PDF_DIR, f));

    if (!pdfs.length) {
        console.error(`Aucun PDF trouvé dans ${PDF_DIR}`);
        process.exit(1);
    }

    console.log("=".repeat(55));
    console.log("  EXTRACTION CHARGES EMPLOYÉS — pdfjs");
    console.log("=".repeat(55));

    const allRows = [];
    for (const pdf of pdfs) {
        const rows = await parsePdf(pdf);
        allRows.push(...rows);
        console.log(`  ✓  ${path.basename(pdf)}: ${rows.length} OTs`);
    }

    // Dédupliquer par (numero_ot, matricule) — plusieurs employés peuvent travailler
    // sur le même OT ; on supprime seulement les doublons cross-PDF (même employé, même OT)
    const seen   = new Set();
    const unique = [];
    for (const row of allRows) {
        const key = `${row.numero_ot}|${row.matricule}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push({ id: unique.length + 1, ...row });
        }
    }

    // Écrire CSV UTF-8 BOM (s'ouvre correctement dans Excel)
    fs.mkdirSync(path.dirname(OUTPUT_CSV), { recursive: true });
    const lines = [
        "\uFEFF" + HEADERS.join(","),
        ...unique.map(r =>
            HEADERS.map(h => csvCell(r[h])).join(",")
        ),
    ];
    fs.writeFileSync(OUTPUT_CSV, lines.join("\n"), "utf8");

    console.log("\n" + "=".repeat(55));
    console.log(`  Total OTs : ${unique.length}`);
    console.log(`  Fichier   : ${path.resolve(OUTPUT_CSV)}`);
    console.log("=".repeat(55));
}

main().catch(err => {
    console.error("Erreur :", err.message);
    process.exit(1);
});