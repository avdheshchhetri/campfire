import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/features/challenges/challenges.css';
import '../../src/styles/challenge-demo.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <main className="cf-shell cf-session-refresh"><div className="cf-workspace"><section className="cf-main">
      <header className="cf-heading"><h1 className="font-display">Practice preview</h1></header>
      <section className="cf-study-question">
        <div className="cf-section-label">Sample topic · Algebra</div>
        <div className="cf-question-heading"><h2 className="font-display">Question</h2></div>
        <p className="cf-question-text">Solve 3x + 5 = 26. Answer with the value of x.</p>
        <p>This is a preview. In a study room, everyone sees the same syllabus question and submits their own answer.</p>
        <a className="cf-primary" href={import.meta.env.BASE_URL}>Open Campfire to start practicing</a>
      </section>
    </section></div></main>
  </React.StrictMode>,
);
