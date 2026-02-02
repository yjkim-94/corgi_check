import { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const session = sessionStorage.getItem('corgi_auth');
    if (session === 'true') {
      setAuthenticated(true);
      setChecking(false);
      return;
    }
    api.auth.check().then((res) => {
      if (!res.exists) {
        setAuthenticated(true);
        sessionStorage.setItem('corgi_auth', 'true');
        navigate('/admin');
      }
      setChecking(false);
    });
  }, []);

  const handleLogin = async () => {
    setError('');
    try {
      await api.auth.login(password);
      sessionStorage.setItem('corgi_auth', 'true');
      setAuthenticated(true);
    } catch {
      setError('비밀번호가 틀렸습니다.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  if (checking) return null;
  if (authenticated) return <>{children}</>;

  return (
    <>
      <div className="fixed inset-0 backdrop-blur-md bg-white/50" />
      <Dialog open={true} onClose={() => {}} className="relative z-50">
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xs">
            <DialogTitle className="font-bold text-lg text-center mb-1">
              <span className="text-corgi">Corgi Check</span>
            </DialogTitle>
            <p className="text-center text-sm text-gray-500 mb-4">비밀번호를 입력하세요</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full bg-corgi text-white py-2 rounded font-medium text-sm hover:bg-corgi-dark transition"
            >
              확인
            </button>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
