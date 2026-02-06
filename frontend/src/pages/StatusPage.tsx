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

interface ExcludeEndDate {
  [memberId: number]: string | null; // week_label
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

function weekLabelToDate(weekLabel: string): string {
  // "2026-W05" -> "2월 2일"
  const match = weekLabel.match(/(\d{4})-W(\d{2})/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // ISO week를 Date로 변환
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);

  return `${monday.getMonth() + 1}월 ${monday.getDate()}일`;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateWeeks(pastCount: number, futureCount: number = 0): { label: string; value: string }[] {
  const result: { label: string; value: string }[] = [];
  const thisMonday = getMonday(new Date());

  // 미래 주차 추가 (먼 미래부터)
  for (let i = futureCount; i >= 1; i--) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() + i * 7);
    result.push({
      label: formatWeekLabel(monday),
      value: toISODate(monday),
    });
  }

  // 현재 주차 및 과거 주차 추가
  for (let i = 0; i < pastCount; i++) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() - i * 7);
    result.push({
      label: formatWeekLabel(monday),
      value: toISODate(monday),
    });
  }

  return result;
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
  const [consecutiveWeeks, setConsecutiveWeeks] = useState<Record<number, number>>({});
  const [successBanner, setSuccessBanner] = useState('');
  const [pendingExcludeReason, setPendingExcludeReason] = useState<Record<number, { reason: string; detail: string | null }>>({});
  const [excludeEndDates, setExcludeEndDates] = useState<ExcludeEndDate>({});

  // localStorage에서 futureWeeks 복원 (최소 4주)
  const [weeks, setWeeks] = useState(() => {
    const saved = localStorage.getItem('futureWeeksCount');
    const futureCount = Math.max(saved ? parseInt(saved, 10) : 4, 4);
    return generateWeeks(16, futureCount);
  });
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const saved = localStorage.getItem('futureWeeksCount');
    const futureCount = Math.max(saved ? parseInt(saved, 10) : 4, 4);
    return generateWeeks(16, futureCount)[futureCount];
  });

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(''), 1500);
  };

  const load = async (weekStart?: string) => {
    try {
      const res = await api.status.current(weekStart);
      setData(res);

      // 제외 상태인 멤버들의 제외 종료일을 조회 주차 기준으로 서버에서 재조회
      const excludeMembers = res.filter((m: MemberStatus) => m.status === 'exclude');
      const endDates: ExcludeEndDate = {};
      if (excludeMembers.length > 0) {
        await Promise.all(
          excludeMembers.map(async (m: MemberStatus) => {
            try {
              const result = await api.status.getExcludeEnd(m.id, weekStart);
              endDates[m.id] = result.last_week_label;
            } catch {
              endDates[m.id] = null;
            }
          })
        );
      }

      // 서버 조회 결과로 갱신 (제외가 아닌 멤버는 기존 값 유지)
      setExcludeEndDates((prev) => {
        const merged = { ...endDates };
        // 현재 조회 주차에 제외가 아니지만, 다른 주차에서 설정된 값은 유지
        for (const [memberId, endDate] of Object.entries(prev)) {
          if (!(Number(memberId) in merged) && endDate) {
            merged[Number(memberId)] = endDate;
          }
        }
        return merged;
      });
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
    const update: any = {
      status: newStatus,
      week_start: selectedWeek.value,
    };
    if (newStatus !== 'exclude') {
      update.exclude_reason = null;
      update.exclude_reason_detail = null;
    }

    try {
      const response: any = await api.status.update(member.id, update);

      // 서버가 재계산한 제외 종료 주차로 갱신 (단일 소스)
      setExcludeEndDates((prev) => {
        const updated = { ...prev };
        if (response.exclude_end_label) {
          updated[member.id] = response.exclude_end_label;
        } else {
          delete updated[member.id];
        }
        return updated;
      });

      load(selectedWeek.value);
    } catch (e: any) {
      alert(e.message || '상태 변경 실패');
    }
  };

  const handleExcludeReason = (member: MemberStatus, reason: string) => {
    const detail = reason === 'custom' ? prompt('세부 사유를 입력하세요:') || '' : null;

    // 로컬 state에 저장 (API 호출 안 함)
    setPendingExcludeReason({
      ...pendingExcludeReason,
      [member.id]: { reason, detail }
    });
  };

  const handleConsecutiveWeeksChange = async (member: MemberStatus, numWeeks: number) => {
    if (numWeeks === 0) return;

    // 로컬 state 또는 기존 데이터에서 제외 사유 가져오기
    const pending = pendingExcludeReason[member.id];
    const excludeReason = pending?.reason || member.exclude_reason;
    const excludeDetail = pending?.detail || member.exclude_reason_detail;

    try {
      const response: any = await api.status.update(member.id, {
        status: 'exclude',
        exclude_reason: excludeReason || undefined,
        exclude_reason_detail: excludeDetail || undefined,
        consecutive_weeks: numWeeks,
        week_start: selectedWeek.value, // 선택된 주차부터 시작
      });

      // 성공 배너 표시
      const reasonLabel = excludeReason ? EXCLUDE_LABELS[excludeReason] : '제외';
      const detailText = excludeDetail ? ` (${excludeDetail})` : '';
      const bannerMsg = `${member.name}님이 ${numWeeks}주 동안 ${reasonLabel}${detailText}로 제외 처리되었습니다`;
      setSuccessBanner(bannerMsg);
      setTimeout(() => setSuccessBanner(''), 3000);

      // 선택된 주차부터 N주 후까지 미래 주차 계산
      const selectedMonday = new Date(selectedWeek.value);
      const endMonday = new Date(selectedMonday);
      endMonday.setDate(endMonday.getDate() + (numWeeks - 1) * 7);
      const endMondayStr = toISODate(endMonday);
      const thisMondayStr = toISODate(getMonday(new Date()));

      // 현재 주차로부터 몇 주 후인지 계산
      if (endMondayStr > thisMondayStr) {
        const diffDays = Math.floor((endMonday.getTime() - getMonday(new Date()).getTime()) / (1000 * 60 * 60 * 24));
        const neededFuture = Math.max(Math.ceil(diffDays / 7), 4); // 최소 4주

        setWeeks((prev) => {
          let currentFuture = 0;
          for (const w of prev) {
            if (w.value > thisMondayStr) currentFuture++;
            else break;
          }
          if (neededFuture > currentFuture) {
            localStorage.setItem('futureWeeksCount', String(neededFuture));
            return generateWeeks(16, neededFuture);
          }
          return prev;
        });
      }

      // 서버가 재계산한 제외 종료 주차로 갱신 (단일 소스)
      if (response.exclude_end_label) {
        setExcludeEndDates((prev) => ({
          ...prev,
          [member.id]: response.exclude_end_label
        }));
      }

      // 상태 초기화
      setConsecutiveWeeks({ ...consecutiveWeeks, [member.id]: 0 });
      const newPending = { ...pendingExcludeReason };
      delete newPending[member.id];
      setPendingExcludeReason(newPending);

      // 데이터 새로고침
      load(selectedWeek.value);
    } catch (e: any) {
      alert(e.message || '상태 변경 실패');
    }
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

  // 상태별 통계 계산
  const excludeCount = sortedData.filter(m => m.status === 'exclude').length;
  const fineCount = sortedData.filter(m => m.status === 'fine').length;
  const injeungCount = sortedData.length - excludeCount - fineCount;

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

      {/* 상태별 통계 */}
      <div className="flex gap-3 mb-4">
        <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-600">인증</span>
          <span className="text-lg font-bold text-green-600">{injeungCount}</span>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-600">제외</span>
          <span className="text-lg font-bold text-blue-600">{excludeCount}</span>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-600">벌금</span>
          <span className="text-lg font-bold text-red-600">{fineCount}</span>
        </div>
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
          <div className="relative shrink-0 w-40" ref={dropdownRef}>
            <label className="block text-sm text-gray-600 mb-1">주차 선택</label>
            <button
              onClick={() => setShowWeekDropdown(!showWeekDropdown)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-left flex items-center justify-between whitespace-nowrap"
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
                      load(w.value);
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

      {/* 성공 배너 */}
      {successBanner && (
        <div className="mb-4 bg-green-50 border border-green-300 text-green-800 rounded-lg px-4 py-3 text-sm">
          {successBanner}
        </div>
      )}

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
                    className={`border rounded px-2 py-1 text-sm ${
                      m.status === 'exclude'
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : m.status === 'fine'
                        ? 'bg-red-50 border-red-300 text-red-800'
                        : 'bg-green-50 border-green-300 text-green-800'
                    }`}
                  >
                    <option value="injeung" className="bg-green-50 text-green-800">인증</option>
                    <option value="exclude" className="bg-blue-50 text-blue-800">제외</option>
                    <option value="fine" className="bg-red-50 text-red-800">벌금</option>
                  </select>
                  {m.status === 'exclude' && (
                    <>
                      <select
                        value={pendingExcludeReason[m.id]?.reason || m.exclude_reason || ''}
                        onChange={(e) => handleExcludeReason(m, e.target.value)}
                        className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        <option value="">사유 선택</option>
                        {EXCLUDE_OPTIONS.map((o) => (
                          <option key={o} value={o}>{EXCLUDE_LABELS[o]}</option>
                        ))}
                      </select>
                      {(pendingExcludeReason[m.id]?.reason || m.exclude_reason) && (
                        <>
                          <select
                            value={consecutiveWeeks[m.id] || 0}
                            onChange={(e) => handleConsecutiveWeeksChange(m, Number(e.target.value))}
                            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                          >
                            <option value={0}>선택</option>
                            {((pendingExcludeReason[m.id]?.reason || m.exclude_reason) === 'travel'
                              ? [1, 2]
                              : [1, 2, 3, 4, 5, 6, 7, 8]
                            ).map(n => (
                              <option key={n} value={n}>{n}주</option>
                            ))}
                          </select>
                          {excludeEndDates[m.id] && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({weekLabelToDate(excludeEndDates[m.id]!)} 주까지 제외)
                            </span>
                          )}
                        </>
                      )}
                    </>
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
        {successBanner && (
          <div className="mb-4 bg-green-50 border border-green-300 text-green-800 rounded-lg px-4 py-3 text-sm">
            {successBanner}
          </div>
        )}
        {sortedData.map((m) => (
          <div key={m.id} className="bg-white rounded-lg shadow p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{m.name}</span>
                <span className="text-xs text-gray-400">{m.birth_date ? `${m.birth_date}년` : '-'}</span>
              </div>
              <div className="flex items-start gap-1">
                <select
                  value={m.status}
                  onChange={(e) => handleStatusChange(m, e.target.value)}
                  className={`border rounded px-1 py-1 text-xs ${
                    m.status === 'exclude'
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : m.status === 'fine'
                      ? 'bg-red-50 border-red-300 text-red-800'
                      : 'bg-green-50 border-green-300 text-green-800'
                  }`}
                >
                  <option value="injeung" className="bg-green-50 text-green-800">인증</option>
                  <option value="exclude" className="bg-blue-50 text-blue-800">제외</option>
                  <option value="fine" className="bg-red-50 text-red-800">벌금</option>
                </select>
                {m.status === 'exclude' && (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <select
                        value={pendingExcludeReason[m.id]?.reason || m.exclude_reason || ''}
                        onChange={(e) => handleExcludeReason(m, e.target.value)}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-20"
                      >
                        <option value="">사유</option>
                        {EXCLUDE_OPTIONS.map((o) => (
                          <option key={o} value={o}>{EXCLUDE_LABELS[o]}</option>
                        ))}
                      </select>
                      {(pendingExcludeReason[m.id]?.reason || m.exclude_reason) && (
                        <select
                          value={consecutiveWeeks[m.id] || 0}
                          onChange={(e) => handleConsecutiveWeeksChange(m, Number(e.target.value))}
                          className="border border-gray-300 rounded px-1 py-1 text-xs w-16"
                        >
                          <option value={0}>선택</option>
                          {((pendingExcludeReason[m.id]?.reason || m.exclude_reason) === 'travel'
                            ? [1, 2]
                            : [1, 2, 3, 4, 5, 6, 7, 8]
                          ).map(n => (
                            <option key={n} value={n}>{n}주</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {excludeEndDates[m.id] && (
                      <span className="text-xs text-gray-500">
                        {weekLabelToDate(excludeEndDates[m.id]!)} 주까지 제외
                      </span>
                    )}
                  </div>
                )}
              </div>
              {m.exclude_reason === 'custom' && m.exclude_reason_detail && (
                <span className="text-xs text-gray-500">상세: {m.exclude_reason_detail}</span>
              )}
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
