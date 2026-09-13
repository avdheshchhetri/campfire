import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { supabase } from './lib/supabaseClient';

// Supabase uses the URL fragment for confirmation links; consume it before
// GitHub Pages' HashRouter interprets the fragment as an application route.
async function mount() {
  if (supabase && /(?:^#|&)(?:access_token|error)=/.test(window.location.hash)) {
    try { await supabase.auth.getSession(); } catch { /* AuthContext reports session errors. */ }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);

}
void mount();
