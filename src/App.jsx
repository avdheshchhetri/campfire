import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppLayout, { RequireRoom } from './components/AppLayout';
import Landing from './pages/Landing';
import RoomDashboard from './pages/RoomDashboard';
import Session from './pages/Session';
import NotFound from './pages/NotFound';
import Leaderboard from './features/leaderboard/Leaderboard.jsx';
import Syllabus from './pages/Syllabus.jsx';

const Router = import.meta.env.VITE_GITHUB_PAGES === 'true' ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Landing />} />
            <Route path="room/:roomId" element={<RequireRoom />}>
              <Route index element={<RoomDashboard />} />
              <Route path="session/:sessionId" element={<Session />} />
              <Route path="session/:sessionId/phone" element={<Session view="phone" />} />
              <Route path="session/:sessionId/shared" element={<Session view="shared" />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="syllabus" element={<Syllabus />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
