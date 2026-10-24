export const norm = (s) => { let d = String(s || '').replace(/\D/g, ''); if (d.length > 10) d = d.slice(-10); return d; };
export const validNum = (d) => /^[6-9]\d{9}$/.test(d);

export function parseRecipients(text) {
  const seen = new Set(), valid = [], invalid = []; let dups = 0;
  String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const [num, ...rest] = l.split(/[,\t;]/);
    const to = norm(num), name = rest.join(' ').trim();
    if (!validNum(to)) return invalid.push(l);
    if (seen.has(to)) return dups++;
    seen.add(to); valid.push({ to, name });
  });
  return { valid, invalid, dups };
}
export const LABEL = { done: 'Answered', missed: 'No answer', failed: 'Failed', pending: 'In queue' };
export const TONE = { done: 'g', missed: 'a', failed: 'r', pending: 'n' };
