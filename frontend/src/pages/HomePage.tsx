import { useNavigate } from 'react-router-dom';

const menus = [
  { to: '/status', title: '인증 현황', desc: '멤버 인증 상태 확인 및 변경' },
  { to: '/history', title: '과거 인증 내역', desc: '주차별 인증 기록 조회' },
  { to: '/members', title: '인원 관리', desc: '멤버 추가, 수정, 탈퇴 처리' },
  { to: '/admin', title: '관리자 메뉴', desc: '비밀번호, 운영진, 정산 설정' },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-corgi mb-2">Corgi Check</h1>
      <p className="text-gray-500 mb-10">운동 인증 관리 시스템</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
        {menus.map((m) => (
          <button
            key={m.to}
            onClick={() => navigate(m.to)}
            className="bg-dark rounded-xl shadow hover:shadow-lg p-6 text-left transition hover:-translate-y-0.5"
          >
            <div className="font-bold text-corgi">{m.title}</div>
            <div className="text-sm text-gray-400 mt-1">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
