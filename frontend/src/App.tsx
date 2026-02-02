import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGate from './components/AuthGate';
import HomePage from './pages/HomePage';
import StatusPage from './pages/StatusPage';
import HistoryPage from './pages/HistoryPage';
import MembersPage from './pages/MembersPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
