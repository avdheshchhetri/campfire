import React from 'react';
import { createRoot } from 'react-dom/client';
import { StudyMinigames } from '../../src/features/challenges/StudyMinigames';
import '../../src/features/challenges/challenges.css';
import '../../src/styles/challenge-demo.css';
const topics=[{id:'1',title:'Recursion'},{id:'2',title:'Sorting'},{id:'3',title:'Binary trees'},{id:'4',title:'Algorithms'}];
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="cf-shell cf-session-refresh"><div className="cf-workspace"><section className="cf-main"><header className="cf-heading"><h1 className="font-display">Study games demo</h1></header><p className="cf-study-question">Sample computer science topics. In your study room, games use your own syllabus. No hints or backend connection.</p><StudyMinigames topics={topics}/></section></div></main></React.StrictMode>);
