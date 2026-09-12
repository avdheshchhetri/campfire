export function makeJoinCode() {
  // 32 symbols divide 256 evenly; no modulo bias and no ambiguous 0/O/1/I.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte % alphabet.length]).join('');
}

export function daysUntilExam(examDate, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate || '')) return null;
  const [year, month, day] = examDate.split('-').map(Number);
  const exam = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam - today) / 86400000);
}

export const titleKey = title => title.trim().toLowerCase().replace(/\s+/g, ' ');

export function newTopicRows(parsed, existing, roomId) {
  const known = new Set(existing.map(topic => titleKey(topic.title)));
  let order = Math.max(-1, ...existing.map(topic => Number.isInteger(topic.order_index) ? topic.order_index : -1));
  return parsed.filter(topic => {
    const key = titleKey(topic.title);
    if (!key || known.has(key)) return false;
    known.add(key); return true;
  }).map(topic => ({ room_id: roomId, title: topic.title.trim(), order_index: ++order, status: 'untouched' }));
}
