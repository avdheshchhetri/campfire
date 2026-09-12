import React from 'react';
import { createRoot } from 'react-dom/client';
import SyllabusTracker from '../../src/features/syllabus/SyllabusTracker.jsx';
import { demoData, demoRoomId, notifyDemo } from './supabaseClient.js';
import '../../src/styles.css';

// Deliberately scoped to this demo entry point: no API keys, no real AI calls,
// no persistence. Production never imports this file.
const originalFetch = window.fetch.bind(window);
window.fetch = async (url, options) => {
  if (!['/api/parse-syllabus', '/api/verify-teaching'].includes(url)) return originalFetch(url, options);
  const body = JSON.parse(options.body);
  if (url === '/api/parse-syllabus') {
    if (body.pdf) return Response.json({ error: 'Your PDF was read successfully. Real PDF analysis needs the live Gemini API and Supabase configuration. This local demo does not send documents to an AI. You can still use Paste text to preview the topic flow.' }, { status: 503 });
    const topics = body.text.split(/[\n;]+/).map(title => title.trim()).filter(Boolean).slice(0, 100).map((title, order_index) => ({ title: title.slice(0, 200), order_index }));
    return Response.json({ topics });
  }
  const topic = demoData().syllabus_topics.find(item => item.id === body.topicId);
  if (!topic) return Response.json({ error: 'Select a demo topic.' }, { status: 404 });
  if (body.stage === 'question') {
    topic.status = 'taught'; notifyDemo();
    return Response.json({ question: `Give a concrete example of ${topic.title.toLowerCase()} and explain why it works.`, attempt: 'demo-only', status: 'taught' });
  }
  const verified = body.answer.toLowerCase().includes('example');
  topic.status = verified ? 'verified' : 'taught'; notifyDemo();
  return Response.json({ verified, status: topic.status, feedback: verified ? 'Demo assessment: your topic is now verified. Live mode uses Gemini to assess understanding.' : 'Demo assessment: include the word “example” to try the success state. This demo does not judge correctness.' });
};

createRoot(document.getElementById('root')).render(<React.StrictMode><div className="bg-amber-100 px-5 py-3 text-center text-xs text-amber-950"><strong>LOCAL UI DEMO</strong> · Simulated Supabase and AI. PDF analysis needs live setup. Paste one topic per line; include “example” in a follow-up to try verification. Nothing is sent or saved.</div><SyllabusTracker initialRoomId={demoRoomId} /></React.StrictMode>);
