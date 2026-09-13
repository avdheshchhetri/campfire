import { supabase } from '../../lib/supabaseClient';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { watchSession } from './campfireApi';
import { createFocusClock } from './focusClock';

const Context = createContext(null);
export function FocusClockProvider({ children }) {
  const { user } = useAuth();
  const stores = useRef(new Map());
  useEffect(() => () => { for (const store of stores.current.values()) store.stop(); stores.current.clear(); }, [user?.id]);
  function getStore(sessionId) {
    if (stores.current.has(sessionId)) return stores.current.get(sessionId);
    const key = `campfire:focus:${user?.id}:${sessionId}`;
    let initial = 0;
    try { initial = Math.max(0, Number(sessionStorage.getItem(key)) || 0); } catch {}
    const clock = createFocusClock({ initial, save: value => { try { sessionStorage.setItem(key, String(value)); } catch {} } });
    const listeners = new Set();
    let state = { session: null, rows: [], online: new Set(), status: 'connecting', syncError: '', elapsed: initial };
    let roster = [], disposed = false;
    const emit = () => { state = { ...state, elapsed: clock.elapsed() }; listeners.forEach(fn => fn(state)); };
    function reconcile() {
      const down = new Set(state.rows.filter(row => row.state === 'down').map(row => row.user_id));
      clock.setRunning(Boolean(state.session?.is_active && state.status === 'ready' && roster.length && roster.every(id => state.online.has(id) && down.has(id))));
      emit();
    }
    const stopWatch = watchSession(sessionId, {
      async onSnapshot(session, rows) {
        state = { ...state, session, rows }; reconcile();
        if (session?.room_id) {
          try {
            const result = await supabase.from('room_members').select('user_id').eq('room_id', session.room_id);
            if (disposed) return;
            if (result.error) throw result.error;
            roster = result.data.map(person => person.user_id); reconcile();
          } catch (error) { if (!disposed) { state = { ...state, status: 'error', syncError: error.message }; reconcile(); } }
        }
      },
      onOnline(online) { state = { ...state, online }; reconcile(); },
      onStatus(status, syncError = '') { state = { ...state, status, syncError }; reconcile(); },
    });
    const tick = setInterval(() => { clock.checkpoint(); emit(); }, 250);
    const store = {
      subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
      setRoster(people) { roster = [...new Set(people.map(person => person.user_id))]; reconcile(); },
      end() { state = { ...state, session: { ...state.session, is_active: false } }; reconcile(); this.stop(); },
      stop() { if (disposed) return; disposed = true; clock.setRunning(false); clearInterval(tick); stopWatch(); },
    };
    stores.current.set(sessionId, store);
    return store;
  }
  return <Context.Provider value={getStore}>{children}</Context.Provider>;
}
export function useSessionClock(sessionId, participants) {
  const getStore = useContext(Context);
  const [state, setState] = useState({ session: null, rows: [], online: new Set(), status: 'connecting', syncError: '', elapsed: 0 });
  const storeRef = useRef(null);
  useEffect(() => {
    const store = getStore(sessionId); storeRef.current = store;
    store.setRoster(participants);
    return store.subscribe(setState);
  }, [sessionId]);
  useEffect(() => { storeRef.current?.setRoster(participants); }, [participants]);
  return { ...state, finishClock: () => storeRef.current?.end() };
}
