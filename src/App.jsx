import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppLayout, { RequireRoom } from './components/AppLayout';
import Landing from './pages/Landing';
import RoomDashboard from './pages/RoomDashboard';
import Session from './pages/Session';
import NotFound from './pages/NotFound';
import Leaderboard from './features/leaderboard/Leaderboard.jsx';

// Integration point: add each feature import here, then replace the appropriate
// dashboard/session placeholder below. Keep this one shared wiring file small.
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Landing />} />
            <Route path="room/:roomId" element={<RequireRoom />}>
              <Route index element={<RoomDashboard />} />
              <Route path="session/:sessionId" element={<Session />} />
              <Route path="leaderboard" element={<Leaderboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
