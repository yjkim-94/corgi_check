import { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';

const EXCLUDE_OPTIONS = ['illness', 'travel', 'business', 'injury', 'surgery', 'custom'];
const EXCLUDE_LABELS: Record<string, string> = {
  illness: '질병',
  travel: '여행',
  business: '출장',
  injury: '부상',
  surgery: '수술',
  custom: '직접쓰기',
};

interface MemberStatus {
  id: number;
  name: string;
  birth_date: string | null;
  status: string;
  exclude_reason: string | null;
  exclude_reason_detail: string | null;
  week_label: string;
  week_display: string;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekLabel(monday: Date): string {
  const m = monday.getMonth() + 1;
  const d = monday.getDate();
  return `${m}월 ${d}일(월)`;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateWeeks(count: number): { label: string; value: string }[] {
  const weeks: { label: string; value: string }[] = [];
  const thisMonday = getMonday(new Date());
  for (let i = 0; i < count; i++) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() - i * 7);
    weeks.push({
      label: formatWeekLabel(monday),
      value: toISODate(monday),
    });
  }
  return weeks;
}

function sortByBirthName<T extends { birth_date: string | null; name: string }>(
  list: T[],
  asc: boolean,
): T[] {
  return [...list].sort((a, b) => {
    const ba = a.birth_date || '';
    const bb = b.birth_date || '';
    const cmp = ba.localeCompare(bb) || a.name.localeCompare(b.name);
    return asc ? cmp : -cmp;
  });
}

export default function StatusPage() {
  const [data, setData] = useState<MemberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [settling, setSettling] = useState(false);
  const [midSettling, setMidSettling] = useState(false);
  const [msg, setMsg] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [toast, setToast] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const weeks = generateWeeks(16);
  const [selectedWeek, setSelectedWeek] = useState(weeks[0]);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(''), 1500);
  };

  const load = async () => {
    try {
      const res = await api.status.current();
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.admin.getGmailStatus().then((res) => {
      setGmailConnected(res.connected);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowWeekDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStatusChange = async (member: MemberStatus, newStatus: string) => {
    const update: any = { status: newStatus };
    if (newStatus !== 'exclude') {
      update.exclude_reason = null;
      update.exclude_reason_detail = null;
    }
    await api.status.update(member.id, update);
    load();
  };

  const handleExcludeReason = async (member: MemberStatus, reason: string) => {
    const detail = reason === 'custom' ? prompt('세부 사유를 입력하세요:') || '' : null;
    await api.status.update(member.id, {
      status: 'exclude',
      exclude_reason: reason,
      exclude_reason_detail: detail,
    });
    load();
  };

  const handleSettlement = async () => {
    setSettling(true);
    try {
      const res = await api.admin.runSettlement(selectedWeek.value);
      if (res.error) {
        setMsg(res.error);
        setTimeout(() => setMsg(''), 3000);
      } else {
        setSummaryText(res.summary || '');
        setShowPopup(true);
      }
    } catch (e: any) {
      setMsg(e.message || '정산 실패');
      setTimeout(() => setMsg(''), 3000);
    } finally {
      setSettling(false);
    }
  };

  const handleMidSettlement = async () => {
    setMidSettling(true);
    try {
      const res = await api.admin.runMidSettlement(selectedWeek.value);
      if (res.error) {
        setMsg(res.error);
        setTimeout(() => setMsg(''), 3000);
      } else {
        setSummaryText(res.summary || '');
        setShowPopup(true);
      }
    } catch (e: any) {
      setMsg(e.message || '중간정산 실패');
      setTimeout(() => setMsg(''), 3000);
    } finally {
      setMidSettling(false);
    }
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(summaryText);
    showToast('복사 완료');
  };

  const toggleSort = () => setSortAsc(!sortAsc);

  const sortedData = sortByBirthName(data, sortAsc);

  if (loading) return <p className="text-gray-500">불러오는 중...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">
          인증 현황
          {data.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({data[0]?.week_display})
            </span>
          )}
        </h2>
        <button
          onClick={toggleSort}
          className="text-sm text-gray-500 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100"
        >
          정렬 {sortAsc ? '▲' : '▼'}
        </button>
      </div>

      {/* 정산 실행 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="font-bold mb-3">정산 실행</h3>
        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-2 text-sm mb-3">
            {msg}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="relative shrink-0" ref={dropdownRef}>
            <label className="block text-sm text-gray-600 mb-1">주차 선택</label>
            <button
              onClick={() => setShowWeekDropdown(!showWeekDropdown)}
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white text-left flex items-center justify-between whitespace-nowrap"
            >
              <span>{selectedWeek.label} 주</span>
              <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showWeekDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto">
                {weeks.map((w) => (
                  <button
                    key={w.value}
                    onClick={() => {
                      setSelectedWeek(w);
                      setShowWeekDropdown(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                      w.value === selectedWeek.value ? 'bg-orange-50 text-corgi font-medium' : ''
                    }`}
                  >
                    {w.label} 주
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSettlement}
            disabled={settling || !gmailConnected}
            className={`shrink-0 px-3 py-2 rounded text-sm font-medium whitespace-nowrap ${
              gmailConnected
                ? 'bg-dark text-white hover:bg-gray-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {settling ? '정산 중...' : '정산 실행'}
          </button>
          <button
            onClick={handleMidSettlement}
            disabled={midSettling || !gmailConnected}
            className={`shrink-0 px-3 py-2 rounded text-sm font-medium whitespace-nowrap ${
              gmailConnected
                ? 'bg-corgi text-white hover:bg-corgi-dark'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {midSettling ? '집계 중...' : '중간정산'}
          </button>
        </div>
        {!gmailConnected && (
          <p className="text-xs text-gray-400 mt-2">Gmail 연동 후 사용 가능합니다. (관리자 메뉴에서 연동)</p>
        )}
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 px-3">이름</th>
              <th className="text-left py-2 px-3">생년</th>
              <th className="text-left py-2 px-3">상태</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{m.name}</td>
                <td className="py-2 px-3 text-gray-500">{m.birth_date ? `${m.birth_date}년` : '-'}</td>
                <td className="py-2 px-3">
                  <select
                    value={m.status}
                    onChange={(e) => handleStatusChange(m, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    <option value="injeung">인증</option>
                    <option value="exclude">제외</option>
                    <option value="fine">벌금</option>
                  </select>
                  {m.status === 'exclude' && (
                    <select
                      value={m.exclude_reason || ''}
                      onChange={(e) => handleExcludeReason(m, e.target.value)}
                      className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      <option value="">사유 선택</option>
                      {EXCLUDE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{EXCLUDE_LABELS[o]}</option>
                      ))}
                    </select>
                  )}
                  {m.exclude_reason === 'custom' && m.exclude_reason_detail && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({m.exclude_reason_detail})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="sm:hidden space-y-3">
        {sortedData.map((m) => (
          <div key={m.id} className="bg-white rounded-lg shadow p-3">
            <div className="flex items-center gap-2 flex-nowrap">
              <span className="font-medium text-sm shrink-0">{m.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{m.birth_date ? `${m.birth_date}년` : '-'}</span>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <select
                  value={m.status}
                  onChange={(e) => handleStatusChange(m, e.target.value)}
                  className="border border-gray-300 rounded px-1 py-1 text-xs"
                >
                  <option value="injeung">인증</option>
                  <option value="exclude">제외</option>
                  <option value="fine">벌금</option>
                </select>
                {m.status === 'exclude' && (
                  <select
                    value={m.exclude_reason || ''}
                    onChange={(e) => handleExcludeReason(m, e.target.value)}
                    className="border border-gray-300 rounded px-1 py-1 text-xs"
                  >
                    <option value="">사유</option>
                    {EXCLUDE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{EXCLUDE_LABELS[o]}</option>
                    ))}
                  </select>
                )}
                {m.exclude_reason === 'custom' && m.exclude_reason_detail && (
                  <span className="text-xs text-gray-500">({m.exclude_reason_detail})</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.length === 0 && (
        <p className="text-center text-gray-400 py-8">등록된 멤버가 없습니다.</p>
      )}

      {/* 정산 결과 팝업 */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-lg">정산 결과</h3>
              <button
                onClick={() => setShowPopup(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                x
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                {summaryText}
              </pre>
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button
                onClick={handleCopySummary}
                className="flex-1 bg-corgi text-white px-4 py-2 rounded text-sm font-medium hover:bg-corgi-dark"
              >
                복사
              </button>
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-black bg-opacity-75 text-white px-6 py-3 rounded-lg text-sm font-medium pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
