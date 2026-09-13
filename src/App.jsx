import Games from './pages/Games';
import Flashcards from './pages/Flashcards';
import { FocusClockProvider } from './features/focus/FocusClockProvider';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import AppLayout, { RequireRoom } from './components/layout/AppLayout';
import Landing from './pages/Landing';
import Account from './pages/Account';
import RoomDashboard from './pages/RoomDashboard';
import Session from './pages/Session';
import NotFound from './pages/NotFound';
import Leaderboard from './features/leaderboard/Leaderboard.jsx';
import Syllabus from './pages/Syllabus.jsx';

const Router = import.meta.env.VITE_GITHUB_PAGES === 'true' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <AuthProvider>
      <FocusClockProvider><Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Landing />} />
            <Route path="account" element={<Account />} />
            <Route path="room/:roomId" element={<RequireRoom />}>
              <Route index element={<RoomDashboard />} />
              <Route path="session/:sessionId" element={<Session />} />
              <Route path="session/:sessionId/phone" element={<Session view="phone" />} />
              <Route path="session/:sessionId/shared" element={<Session view="shared" />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="games" element={<Games />} />
              <Route path="flashcards" element={<Flashcards />} />
              <Route path="syllabus" element={<Syllabus />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router></FocusClockProvider>
    </AuthProvider>
  );
}
