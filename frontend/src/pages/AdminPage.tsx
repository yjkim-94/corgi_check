import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [manager, setManager] = useState('');
  const [msg, setMsg] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

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

  const handleResetClick = () => {
    setShowResetPasswordModal(true);
  };

  const handleResetPasswordSubmit = () => {
    if (!resetPassword) {
      alert('비밀번호를 입력하세요');
      return;
    }
    setShowResetPasswordModal(false);
    setShowResetConfirmModal(true);
  };

  const handleResetConfirm = async () => {
    try {
      await api.admin.reset(resetPassword);
      setShowResetConfirmModal(false);
      setResetPassword('');
      setMsg('인증 현황이 초기화되었습니다');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      setShowResetConfirmModal(false);
      setResetPassword('');
      alert(e.message || '초기화 실패');
    }
  };

  const handleResetCancel = () => {
    setShowResetPasswordModal(false);
    setShowResetConfirmModal(false);
    setResetPassword('');
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

      {/* 인증 현황 초기화 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-3 text-red-700">인증 현황 초기화</h3>
        <p className="text-sm text-gray-600 mb-3">
          모든 주차 설정 및 과거 내역이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <button
          onClick={handleResetClick}
          className="bg-red-700 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-800"
        >
          초기화
        </button>
      </div>

      {/* 비밀번호 입력 모달 */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-lg mb-4">비밀번호 확인</h3>
            <input
              type="password"
              placeholder="비밀번호 입력"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleResetCancel}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handleResetPasswordSubmit}
                className="px-4 py-2 bg-corgi text-white rounded text-sm hover:bg-corgi-dark"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 초기화 확인 모달 */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-lg mb-4 text-orange-800">경고</h3>
            <p className="text-sm text-gray-700 mb-4">
              정말 인증 현황을 초기화 하겠습니까?<br />
              모든 주차 설정과 과거 내역이 삭제됩니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleResetCancel}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handleResetConfirm}
                className="px-4 py-2 bg-orange-700 text-white rounded text-sm hover:bg-orange-800"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
