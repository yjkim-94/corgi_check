import { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { api } from '../api/client';

interface MemberData {
  id: number;
  name: string;
  birth_date: string | null;
  is_active: boolean;
  left_date: string | null;
  left_reason: string | null;
}

function sortByBirthName(list: MemberData[], asc: boolean): MemberData[] {
  return [...list].sort((a, b) => {
    const ba = a.birth_date || '';
    const bb = b.birth_date || '';
    const cmp = ba.localeCompare(bb) || a.name.localeCompare(b.name);
    return asc ? cmp : -cmp;
  });
}

export default function MembersPage() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [hideLeft, setHideLeft] = useState(true);
  const [sortAsc, setSortAsc] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<MemberData | null>(null);
  const [showLeave, setShowLeave] = useState<MemberData | null>(null);
  const [form, setForm] = useState({ name: '', birth_year: '' });
  const [leaveForm, setLeaveForm] = useState({ left_date: '', left_reason: '' });

  const load = () => {
    api.members.list(!hideLeft).then(setMembers);
  };

  useEffect(() => { load(); }, [hideLeft]);

  const handleAdd = async () => {
    if (!form.name) return;
    await api.members.create({
      name: form.name,
      birth_year: form.birth_year ? Number(form.birth_year) : null,
    });
    setForm({ name: '', birth_year: '' });
    setShowAdd(false);
    load();
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    await api.members.update(showEdit.id, {
      name: form.name,
      birth_year: form.birth_year ? Number(form.birth_year) : null,
    });
    setShowEdit(null);
    load();
  };

  const handleLeave = async () => {
    if (!showLeave || !leaveForm.left_date || !leaveForm.left_reason) return;
    await api.members.leave(showLeave.id, leaveForm);
    setShowLeave(null);
    setLeaveForm({ left_date: '', left_reason: '' });
    load();
  };

  const handleReturn = async (m: MemberData) => {
    if (!confirm(`${m.name} 멤버를 복귀 처리하시겠습니까?`)) return;
    await api.members.return(m.id);
    load();
  };

  const handleDelete = async (m: MemberData) => {
    if (!confirm(`${m.name} 멤버를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    await api.members.remove(m.id);
    load();
  };

  const openEdit = (m: MemberData) => {
    setForm({ name: m.name, birth_year: m.birth_date || '' });
    setShowEdit(m);
  };

  const toggleSort = () => setSortAsc(!sortAsc);

  const sortedMembers = sortByBirthName(members, sortAsc);

  // 통계 계산
  const totalCount = members.length;
  const activeCount = members.filter(m => m.is_active).length;
  const leftCount = members.filter(m => !m.is_active).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">인원 관리</h2>
        <div className="flex gap-2">
          <button
            onClick={toggleSort}
            className="text-sm text-gray-500 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100"
          >
            정렬 {sortAsc ? '▲' : '▼'}
          </button>
        <button
          onClick={() => { setForm({ name: '', birth_year: '' }); setShowAdd(true); }}
          className="bg-corgi text-white px-4 py-2 rounded text-sm font-medium hover:bg-corgi-dark transition"
        >
          + 멤버 추가
        </button>
        </div>
      </div>

      {/* 인원 통계 */}
      <div className="flex gap-3 mb-4">
        <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-600">전체</span>
          <span className="text-lg font-bold text-gray-900">{totalCount}</span>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-600">활동</span>
          <span className="text-lg font-bold text-green-600">{activeCount}</span>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-gray-600">탈퇴</span>
          <span className="text-lg font-bold text-gray-400">{leftCount}</span>
        </div>
      </div>

      <label className="flex items-center gap-2 mb-4 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={hideLeft}
          onChange={(e) => setHideLeft(e.target.checked)}
          className="rounded"
        />
        탈퇴 인원 숨기기
      </label>

      {/* 데스크탑 테이블 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-center py-2 px-2 w-16">번호</th>
              <th className="text-left py-2 px-3">이름</th>
              <th className="text-left py-2 px-3">생년</th>
              <th className="text-left py-2 px-3">상태</th>
              <th className="text-left py-2 px-3">탈퇴이력</th>
              <th className="text-left py-2 px-3">사유</th>
              <th className="text-left py-2 px-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((m, index) => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-2 text-center text-gray-500 text-sm">{index + 1}</td>
                <td className="py-2 px-3 font-medium">{m.name}</td>
                <td className="py-2 px-3 text-gray-500">{m.birth_date ? `${m.birth_date}년` : '-'}</td>
                <td className="py-2 px-3">
                  {m.is_active ? (
                    <span className="text-green-600 text-sm">활동</span>
                  ) : (
                    <span className="text-red-500 text-sm">탈퇴</span>
                  )}
                </td>
                <td className="py-2 px-3 text-gray-500 text-sm">
                  {m.left_date || '-'}
                </td>
                <td className="py-2 px-3 text-gray-500 text-sm">
                  {m.left_reason || '-'}
                </td>
                <td className="py-2 px-3 flex gap-2">
                  <button onClick={() => openEdit(m)} className="text-sm text-corgi hover:underline">수정</button>
                  {m.is_active ? (
                    <button onClick={() => setShowLeave(m)} className="text-sm text-red-500 hover:underline">탈퇴</button>
                  ) : (
                    <button onClick={() => handleReturn(m)} className="text-sm text-green-600 hover:underline">복귀</button>
                  )}
                  <button onClick={() => handleDelete(m)} className="text-sm text-gray-400 hover:text-gray-700 hover:underline">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="sm:hidden space-y-3">
        {sortedMembers.map((m, index) => (
          <div key={m.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm w-6">{index + 1}</span>
                <span className="font-medium">{m.name}</span>
              </div>
              {m.is_active ? (
                <span className="text-green-600 text-xs">활동</span>
              ) : (
                <span className="text-red-500 text-xs">탈퇴</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-1">{m.birth_date ? `${m.birth_date}년` : '-'}</p>
            {m.left_date && (
              <p className="text-xs text-gray-500 mb-1">탈퇴이력: {m.left_date}</p>
            )}
            {m.left_reason && (
              <p className="text-xs text-gray-500 mb-1">사유: {m.left_reason}</p>
            )}
            <div className="flex gap-3 mt-3">
              <button onClick={() => openEdit(m)} className="text-sm text-corgi hover:underline">수정</button>
              {m.is_active ? (
                <button onClick={() => setShowLeave(m)} className="text-sm text-red-500 hover:underline">탈퇴</button>
              ) : (
                <button onClick={() => handleReturn(m)} className="text-sm text-green-600 hover:underline">복귀</button>
              )}
              <button onClick={() => handleDelete(m)} className="text-sm text-gray-400 hover:text-gray-700 hover:underline">삭제</button>
            </div>
          </div>
        ))}
      </div>

      {/* 추가 / 수정 Modal */}
      <Dialog open={showAdd || showEdit !== null} onClose={() => { setShowAdd(false); setShowEdit(null); }} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <DialogTitle className="font-bold text-lg mb-4">
              {showEdit ? '멤버 수정' : '멤버 추가'}
            </DialogTitle>
            <div className="space-y-3">
              <input
                placeholder="이름"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="생년 (예: 1994)"
                value={form.birth_year}
                onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowAdd(false); setShowEdit(null); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
              <button
                onClick={showEdit ? handleEdit : handleAdd}
                className="bg-corgi text-white px-4 py-2 rounded text-sm font-medium hover:bg-corgi-dark"
              >
                저장
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* 탈퇴 Modal */}
      <Dialog open={showLeave !== null} onClose={() => setShowLeave(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <DialogTitle className="font-bold text-lg mb-4">탈퇴 처리</DialogTitle>
            <p className="text-sm text-gray-500 mb-3">{showLeave?.name}</p>
            <div className="space-y-3">
              <input
                type="date"
                value={leaveForm.left_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, left_date: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <input
                placeholder="탈퇴 사유 (필수)"
                value={leaveForm.left_reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, left_reason: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowLeave(null)}
                className="px-4 py-2 text-sm text-gray-500"
              >
                취소
              </button>
              <button
                onClick={handleLeave}
                className="bg-red-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-600"
              >
                탈퇴 확인
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
