// Local demonstration/test double ONLY. Production components import the host
// src/supabaseClient.js; only the explicit demo/test Vite aliases use this file.
export const demoRoomId = '10000000-0000-0000-0000-000000000001';
export const demoUserId = '30000000-0000-0000-0000-000000000001';
const listeners = new Set();
let store;
export function resetDemo() {
  const exam = new Date(); exam.setDate(exam.getDate() + 5);
  store = {
    rooms: [{ id: demoRoomId, name: 'The algorithms circle', subject: 'CS', join_code: 'FIRE42', exam_date: `${exam.getFullYear()}-${String(exam.getMonth() + 1).padStart(2, '0')}-${String(exam.getDate()).padStart(2, '0')}`, created_by: demoUserId }],
    room_members: [{ room_id: demoRoomId, user_id: demoUserId }],
    syllabus_topics: [
      { id: '20000000-0000-0000-0000-000000000001', title: 'Arrays and linked lists', status: 'verified', order_index: 0 },
      { id: '20000000-0000-0000-0000-000000000002', title: 'Recursion and base cases', status: 'taught', order_index: 1 },
      { id: '20000000-0000-0000-0000-000000000003', title: 'Binary search trees', status: 'untouched', order_index: 2 },
      { id: '20000000-0000-0000-0000-000000000004', title: 'Time and space complexity', status: 'untouched', order_index: 3 },
    ].map(topic => ({ ...topic, room_id: demoRoomId, last_taught_at: null, last_taught_by: null })),
  };
}
resetDemo();
export function demoData() { return store; }
export function notifyDemo() { listeners.forEach(listener => listener()); }

function builder(table) {
  const filters = [];
  let action = 'read'; let payload; let single = false;
  const query = {
    select() { return query; },
    eq(key, value) { filters.push(row => row[key] === value); return query; },
    order() { return query; },
    insert(value) { action = 'insert'; payload = Array.isArray(value) ? value : [value]; return query; },
    single() { single = true; return query; },
    maybeSingle() { single = true; return query; },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (!store[table]) return { data: null, error: { message: `Unsupported demo table: ${table}` } };
        let rows;
        if (action === 'insert') {
          if (table === 'room_members' && payload.some(row => store[table].some(old => old.room_id === row.room_id && old.user_id === row.user_id))) return { data: null, error: { code: '23505', message: 'Already a member' } };
          rows = payload.map(row => ({ id: crypto.randomUUID(), ...row })); store[table].push(...rows); queueMicrotask(notifyDemo);
        } else { rows = store[table].filter(row => filters.every(filter => filter(row))); }
        return { data: JSON.parse(JSON.stringify(single ? rows[0] || null : rows)), error: null };
      }).then(resolve, reject);
    },
  }; return query;
}
export const supabase = {
  auth: {
    async getUser() { return { data: { user: { id: demoUserId } }, error: null }; },
    async getSession() { return { data: { session: { access_token: 'local-demo-not-a-real-token' } }, error: null }; },
  },
  from: builder,
  channel() {
    let listener;
    return { on(_event, _filter, fn) { listener = fn; return this; }, subscribe(fn) { if (listener) listeners.add(listener); fn('SUBSCRIBED'); return this; }, stop() { listeners.delete(listener); } };
  },
  async removeChannel(channel) { channel.stop(); },
};
