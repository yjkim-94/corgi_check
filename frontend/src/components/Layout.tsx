import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '홈' },
  { to: '/status', label: '인증 현황' },
  { to: '/history', label: '과거 내역' },
  { to: '/members', label: '인원 관리' },
  { to: '/admin', label: '관리자' },
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-dark text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <NavLink to="/" className="text-lg font-bold text-corgi">Corgi Check</NavLink>
          {/* 데스크탑 네비게이션 */}
          <nav className="hidden sm:flex gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm font-medium transition ${
                    isActive
                      ? 'bg-corgi text-white'
                      : 'text-gray-300 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {/* 모바일 햄버거 */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-1 text-gray-300 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
        {/* 모바일 드롭다운 */}
        {menuOpen && (
          <nav className="sm:hidden border-t border-gray-700 px-4 py-2 flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm font-medium transition ${
                    isActive
                      ? 'bg-corgi text-white'
                      : 'text-gray-300 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
