import { useEffect, useState } from 'react';
import { api } from '../api/client';

const STATUS_LABELS: Record<string, string> = {
  injeung: '인증',
  exclude: '제외',
  fine: '벌금',
  penalty: '벌점',
};

const EXCLUDE_LABELS: Record<string, string> = {
  illness: '질병',
  travel: '여행',
  business: '출장',
  injury: '부상',
  surgery: '수술',
  custom: '직접쓰기',
};

function weekLabelToKorean(weekLabel: string): string {
  // "2026-W06" -> "2월 2일(월) 주차"
  const match = weekLabel.match(/(\d{4})-W(\d{2})/);
  if (!match) return weekLabel;

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // ISO week를 Date로 변환
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);

  const month = monday.getMonth() + 1;
  const day = monday.getDate();

  return `${month}월 ${day}일(월) 주차`;
}

function sortByBirthName<T extends { birth_date?: string | null; name: string }>(
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

interface GroupedWeeks {
  [year: string]: {
    [month: string]: string[];
  };
}

export default function HistoryPage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    api.history.weeks().then(setWeeks);
  }, []);

  // 연도별, 월별로 그룹화 (월요일 날짜 기준)
  const groupedWeeks: GroupedWeeks = weeks.reduce((acc, weekLabel) => {
    const match = weekLabel.match(/(\d{4})-W(\d{2})/);
    if (!match) return acc;

    const isoYear = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);

    // ISO week를 월요일 날짜로 변환
    const jan4 = new Date(isoYear, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);

    // 월요일 날짜 기준으로 연도와 월 결정
    const year = String(monday.getFullYear());
    const month = String(monday.getMonth() + 1);

    if (!acc[year]) acc[year] = {};
    if (!acc[year][month]) acc[year][month] = [];
    acc[year][month].push(weekLabel);

    return acc;
  }, {} as GroupedWeeks);

  const years = Object.keys(groupedWeeks).sort((a, b) => b.localeCompare(a));
  const months = selectedYear ? Object.keys(groupedWeeks[selectedYear]).sort((a, b) => parseInt(b) - parseInt(a)) : [];
  const weeksInMonth = selectedYear && selectedMonth ? groupedWeeks[selectedYear][selectedMonth] : [];

  const loadDetail = async (week: string) => {
    setSelectedWeek(week);
    const res = await api.history.detail(week);
    setDetail(res);
    setSortAsc(true);
  };

  const handleYearClick = (year: string) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    setSelectedWeek(null);
    setDetail(null);
  };

  const handleMonthClick = (month: string) => {
    setSelectedMonth(month);
    setSelectedWeek(null);
    setDetail(null);
  };

  const handleBack = () => {
    if (selectedMonth) {
      setSelectedMonth(null);
      setSelectedWeek(null);
      setDetail(null);
    } else if (selectedYear) {
      setSelectedYear(null);
    }
  };

  const toggleSort = () => setSortAsc(!sortAsc);

  const sortedMembers = detail?.members
    ? sortByBirthName(detail.members, sortAsc)
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">과거 인증 내역</h2>
          {(selectedYear || selectedMonth) && (
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← 뒤로
            </button>
          )}
        </div>
        {detail && (
          <button
            onClick={toggleSort}
            className="text-sm text-gray-500 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100"
          >
            정렬 {sortAsc ? '▲' : '▼'}
          </button>
        )}
      </div>

      {/* 연도 선택 */}
      {!selectedYear && (
        <div className="flex flex-wrap gap-2 mb-6">
          {years.map((year) => (
            <button
              key={year}
              onClick={() => handleYearClick(year)}
              className="px-4 py-2 rounded text-base font-medium bg-corgi text-white hover:bg-corgi-dark transition"
            >
              {year}년
            </button>
          ))}
          {years.length === 0 && (
            <p className="text-gray-400">저장된 주차 데이터가 없습니다.</p>
          )}
        </div>
      )}

      {/* 월 선택 */}
      {selectedYear && !selectedMonth && (
        <div>
          <h3 className="text-lg font-semibold mb-3">{selectedYear}년</h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-6">
            {months.map((month) => (
              <button
                key={month}
                onClick={() => handleMonthClick(month)}
                className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
              >
                {month}월
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 주차 선택 */}
      {selectedYear && selectedMonth && !selectedWeek && (
        <div>
          <h3 className="text-lg font-semibold mb-3">{selectedYear}년 {selectedMonth}월</h3>
          <div className="flex flex-wrap gap-2 mb-6">
            {weeksInMonth.map((w) => (
              <button
                key={w}
                onClick={() => loadDetail(w)}
                className="px-3 py-1.5 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
              >
                {weekLabelToKorean(w)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 상세 내역 */}
      {detail && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">{weekLabelToKorean(detail.week_label)}</h3>
            <button
              onClick={handleBack}
              className="text-sm text-corgi hover:underline"
            >
              목록으로
            </button>
          </div>
          {detail.summary_text && (
            <div className="bg-gray-50 rounded p-3 mb-4 whitespace-pre-wrap text-sm">
              {detail.summary_text}
            </div>
          )}

          {/* 데스크탑 테이블 */}
          <div className="hidden sm:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 px-3">이름</th>
                  <th className="text-left py-2 px-3">생년</th>
                  <th className="text-left py-2 px-3">상태</th>
                  <th className="text-left py-2 px-3">비고</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-3">{m.name}</td>
                    <td className="py-2 px-3 text-gray-500">{m.birth_date ? `${m.birth_date}년` : '-'}</td>
                    <td className="py-2 px-3">{STATUS_LABELS[m.status] || m.status}</td>
                    <td className="py-2 px-3 text-gray-500 text-sm">
                      {m.exclude_reason ? EXCLUDE_LABELS[m.exclude_reason] || m.exclude_reason : '-'}
                      {m.exclude_reason_detail ? ` (${m.exclude_reason_detail})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="sm:hidden space-y-2">
            {sortedMembers.map((m: any, i: number) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-sm text-gray-500">{STATUS_LABELS[m.status] || m.status}</span>
                </div>
                <p className="text-xs text-gray-400">{m.birth_date ? `${m.birth_date}년` : '-'}</p>
                {m.exclude_reason && (
                  <p className="text-xs text-gray-400 mt-1">
                    비고: {EXCLUDE_LABELS[m.exclude_reason] || m.exclude_reason}
                    {m.exclude_reason_detail ? ` (${m.exclude_reason_detail})` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
