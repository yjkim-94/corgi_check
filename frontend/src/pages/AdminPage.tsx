import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [manager, setManager] = useState('');
  const [msg, setMsg] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    api.admin.getManager().then((res) => {
      if (res.name) setManager(res.name);
    });
    api.admin.getGmailStatus().then((res) => {
      setGmailConnected(res.connected);
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'connected') {
      setGmailConnected(true);
      setMsg('Gmail 연동 완료');
      window.history.replaceState({}, '', '/admin');
      setTimeout(() => setMsg(''), 3000);
    }
  }, []);

  const handlePassword = async () => {
    if (!password) return;
    await api.admin.setPassword(password);
    setPassword('');
    setMsg('비밀번호 설정 완료');
    setTimeout(() => setMsg(''), 3000);
  };

  const handleManager = async () => {
    if (!manager) return;
    await api.admin.setManager(manager);
    setMsg('운영진 설정 완료');
    setTimeout(() => setMsg(''), 3000);
  };

  const handleGmailConnect = async () => {
    const res = await api.admin.getGmailAuthUrl();
    if (res.error) {
      setMsg(res.error);
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    if (res.url) {
      window.location.href = res.url;
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">관리자 메뉴</h2>

      {msg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-2 text-sm">
          {msg}
        </div>
      )}

      {/* 비밀번호 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-3">비밀번호 설정</h3>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="새 비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handlePassword}
            className="bg-corgi text-white px-4 py-2 rounded text-sm font-medium hover:bg-corgi-dark"
          >
            저장
          </button>
        </div>
      </div>

      {/* 운영진 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-3">운영진 설정</h3>
        <div className="flex gap-2">
          <input
            placeholder="담당자 이름"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handleManager}
            className="bg-corgi text-white px-4 py-2 rounded text-sm font-medium hover:bg-corgi-dark"
          >
            저장
          </button>
        </div>
      </div>

      {/* Gmail */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-3">Gmail 연동</h3>
        {gmailConnected ? (
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
            <span className="text-sm text-green-700">연동됨</span>
          </div>
        ) : (
          <button
            onClick={handleGmailConnect}
            className="bg-corgi text-white px-4 py-2 rounded text-sm font-medium hover:bg-corgi-dark"
          >
            Google 계정 연결
          </button>
        )}
      </div>
    </div>
  );
}
