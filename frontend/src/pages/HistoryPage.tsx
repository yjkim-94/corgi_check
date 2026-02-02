import { useEffect, useState } from 'react';
import { api } from '../api/client';

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

export default function HistoryPage() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    api.history.weeks().then(setWeeks);
  }, []);

  const loadDetail = async (week: string) => {
    setSelected(week);
    const res = await api.history.detail(week);
    setDetail(res);
    setSortAsc(true);
  };

  const toggleSort = () => setSortAsc(!sortAsc);

  const sortedMembers = detail?.members
    ? sortByBirthName(detail.members, sortAsc)
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">과거 인증 내역</h2>
        {detail && (
          <button
            onClick={toggleSort}
            className="text-sm text-gray-500 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100"
          >
            정렬 {sortAsc ? '▲' : '▼'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {weeks.map((w) => (
          <button
            key={w}
            onClick={() => loadDetail(w)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${
              selected === w
                ? 'bg-corgi text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {w}
          </button>
        ))}
        {weeks.length === 0 && (
          <p className="text-gray-400">저장된 주차 데이터가 없습니다.</p>
        )}
      </div>

      {detail && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-2">{detail.week_label}</h3>
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
                  <th className="text-left py-2 px-3">상태</th>
                  <th className="text-left py-2 px-3">비고</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-3">{m.name}</td>
                    <td className="py-2 px-3">{m.status}</td>
                    <td className="py-2 px-3 text-gray-500 text-sm">
                      {m.exclude_reason || '-'}
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
                <div className="flex items-center justify-between">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-sm text-gray-500">{m.status}</span>
                </div>
                {m.exclude_reason && (
                  <p className="text-xs text-gray-400 mt-1">
                    {m.exclude_reason}
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
