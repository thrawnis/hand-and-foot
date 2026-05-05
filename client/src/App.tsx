import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LobbyPage } from './components/lobby/LobbyPage';
import { GamePage } from './components/game/GamePage';
import { AdminPage } from './components/admin/AdminPage';

export function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1b5e20',
            color: '#fff',
            border: '1px solid #2e7d32',
          },
          success: {
            style: { background: '#1b5e20' },
            iconTheme: { primary: '#ffc107', secondary: '#1b5e20' },
          },
          error: {
            style: { background: '#7f1d1d', border: '1px solid #991b1b' },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/game/:code" element={<GamePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
