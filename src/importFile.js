import readXlsxFile from 'read-excel-file';
import { norm, validNum } from './lib';

// ---- tiny CSV parser: quotes, BOM, CRLF, and , ; or tab as separator ----
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const cell = (v) => (v == null ? '' : v instanceof Date ? '' : String(v)).trim();
const isNum = (v) => validNum(norm(cell(v)));

// rows (array of arrays) -> "number, name" lines. Finds the phone / name columns by header text or by content.
export function rowsToLines(rows) {
  rows = rows.map((r) => r.map(cell)).filter((r) => r.some(Boolean));
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const hasHeader = !rows[0].some((v) => isNum(v)) && rows.length > 1;
  const head = hasHeader ? rows[0].map((h) => h.toLowerCase()) : [];
  const body = hasHeader ? rows.slice(1) : rows;

  let phone = head.findIndex((h) => /(phone|mobile|contact|number|\bno\b|whatsapp)/.test(h));
  if (phone < 0 || body.filter((r) => isNum(r[phone])).length === 0) {
    let best = -1, bestN = 0;
    for (let c = 0; c < width; c++) { const n = body.filter((r) => isNum(r[c])).length; if (n > bestN) { best = c; bestN = n; } }
    phone = best;
  }
  if (phone < 0) return [];
  let name = head.findIndex((h, i) => i !== phone && /(name|student|parent|guardian|father|mother)/.test(h));
  if (name < 0) name = [...Array(width).keys()].find((c) => c !== phone && body.some((r) => r[c] && !isNum(r[c]) && !/^\d+$/.test(r[c]))) ?? -1;

  return body.filter((r) => isNum(r[phone])).map((r) => `${norm(r[phone])}${name >= 0 && r[name] ? ', ' + r[name].replace(/[\n\r,]+/g, ' ').replace(/\s+/g, ' ') : ''}`);
}

// File (.csv .txt .xlsx) -> text lines ready for the numbers box
export async function fileToLines(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'xls') throw new Error('Old .xls files are not supported. In Excel choose File → Save As → .xlsx (or CSV) and try again.');
  const rows = ext === 'xlsx' ? await readXlsxFile(file) : parseCsv(await file.text());
  const lines = rowsToLines(rows);
  if (!lines.length) throw new Error('No valid 10-digit mobile numbers were found in this file. Put numbers in one column (optionally names in another).');
  return lines;
}
