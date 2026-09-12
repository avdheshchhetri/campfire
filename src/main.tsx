import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChallengePanel } from './features/challenges/ChallengeEngine';
import { createDemoAdapter, demoPlayers } from './features/challenges/demoAdapter';
import './styles.css';
function Demo() {
  const [player, setPlayer] = useState(0);
  const current = useRef(player); current.current = player;
  const [adapter] = useState(() => createDemoAdapter(() => current.current));
  return <><div className="cf-demo-bar"><span><strong>INTERACTIVE DEMO</strong> · Switch perspectives to try all three private clues. No backend connected.</span><label>Viewing as <select value={player} onChange={event => setPlayer(Number(event.target.value))}>{demoPlayers.map((p, i) => <option key={p.user_id} value={i}>{p.display_name}</option>)}</select></label></div><ChallengePanel adapter={adapter} userId={`demo-${player}`} demo/></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Demo/></StrictMode>);
