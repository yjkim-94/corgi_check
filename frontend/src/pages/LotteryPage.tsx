import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const STATUS_LABELS: Record<string, string> = {
  injeung: '인증',
  exclude: '제외',
  fine: '벌금',
  penalty: '벌점',
};

function weekLabelToKorean(weekLabel: string): string {
  const match = weekLabel.match(/(\d{4})-W(\d{2})/);
  if (!match) return weekLabel;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);
  return `${monday.getMonth() + 1}월 ${monday.getDate()}일(월) 주차`;
}

interface Member {
  name: string;
  status: string;
  birth_date?: string | null;
  is_active?: boolean;
}

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  duration: number;
}

interface QuarterResult {
  allWeeks: string[];
  recordedWeeks: string[];
  unrecordedWeeks: string[];
  topMembers: { name: string; birth_date?: string | null }[];
}

type TabType = 'weekly' | 'quarter';

const SLOT_FRAMES = 30;
const SPIN_RATIO = 0.65;
const PAUSE_AFTER_WIN_RATIO = 0.35;

const CONFETTI_COLORS = [
  '#f97316', '#fb923c', '#fbbf24', '#fcd34d', '#fef08a',
  '#fdba74', '#fed7aa', '#ffffff',
];

// ISO W53이 있는 연도 판별
function hasWeek53(year: number): boolean {
  const jan1Day = new Date(year, 0, 1).getDay();
  const dec31Day = new Date(year, 11, 31).getDay();
  return jan1Day === 4 || dec31Day === 4;
}

// ISO 주차의 월요일 날짜 반환
function getISOMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (week - 1) * 7);
  return monday;
}

// 해당 주(월~일)에서 일자가 가장 많은 달의 분기 반환
function getWeekDominantQuarter(year: number, week: number): number {
  const monday = getISOMonday(year, week);
  const monthCount: Record<number, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const m = d.getMonth() + 1;
    monthCount[m] = (monthCount[m] || 0) + 1;
  }
  const dominantMonth = parseInt(
    Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0][0]
  );
  return Math.ceil(dominantMonth / 3);
}

// 분기별 전체 ISO 주차 레이블 생성 (주의 다수 일자 기준)
function getQuarterWeeks(year: number, quarter: number): string[] {
  const maxWeek = hasWeek53(year) ? 53 : 52;
  const result: string[] = [];
  for (let w = 1; w <= maxWeek; w++) {
    if (getWeekDominantQuarter(year, w) === quarter) {
      result.push(`${year}-W${String(w).padStart(2, '0')}`);
    }
  }
  return result;
}

function getBirthPrefix(birth_date?: string | null): string {
  if (!birth_date) return '';
  const yearPart = birth_date.split('-')[0];
  return yearPart.slice(-2);
}

export default function LotteryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('weekly');

  // 주차 추첨 상태
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const [filterStatus, setFilterStatus] = useState<Record<string, boolean>>({
    injeung: true,
    fine: false,
    penalty: false,
    exclude: false,
  });

  const [drawCount, setDrawCount] = useState(1);
  const [drawTime, setDrawTime] = useState(2);
  const [isRunning, setIsRunning] = useState(false);
  const [currentDraw, setCurrentDraw] = useState(0);
  const [slotName, setSlotName] = useState('');
  const [isWinner, setIsWinner] = useState(false);
  const [drawn, setDrawn] = useState<Member[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);

  const slotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawnRef = useRef<Member[]>([]);
  const particleIdRef = useRef(0);

  // 분기 우수 인증자 상태
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  // 1단계: 주차 목록
  const [quarterWeekData, setQuarterWeekData] = useState<{
    allWeeks: string[];
    recordedWeeks: string[];
    unrecordedWeeks: string[];
  } | null>(null);
  const [loadingWeekList, setLoadingWeekList] = useState(false);
  // 체크된(계산에 포함할) 주차
  const [checkedWeeks, setCheckedWeeks] = useState<Set<string>>(new Set());
  // 2단계: 계산 결과
  const [quarterResult, setQuarterResult] = useState<QuarterResult | null>(null);
  const [loadingQuarter, setLoadingQuarter] = useState(false);
  const [quarterCopyDone, setQuarterCopyDone] = useState(false);
  const [excludeNote, setExcludeNote] = useState('');

  // 연도 목록 (weeks 데이터 기준으로 최소 연도~현재 연도)
  const yearOptions = (() => {
    const yearsFromData = weeks
      .map((w) => parseInt(w.split('-')[0], 10))
      .filter((y) => !isNaN(y));
    const minYear = yearsFromData.length > 0 ? Math.min(...yearsFromData) : currentYear;
    const maxYear = currentYear;
    const result: number[] = [];
    for (let y = maxYear; y >= minYear; y--) result.push(y);
    return result;
  })();

  useEffect(() => {
    api.history.weeks().then(setWeeks);
  }, []);

  const pool = members.filter((m) => m.is_active !== false && filterStatus[m.status]);
  const maxDraw = pool.length;

  const resetLottery = useCallback(() => {
    if (slotTimerRef.current) clearTimeout(slotTimerRef.current);
    setIsRunning(false);
    setCurrentDraw(0);
    setSlotName('');
    setIsWinner(false);
    setDrawn([]);
    setShowResult(false);
    setCopyDone(false);
    setParticles([]);
    drawnRef.current = [];
  }, []);

  const handleWeekChange = async (w: string) => {
    setSelectedWeek(w);
    if (!w) { setMembers([]); return; }
    setLoadingWeek(true);
    try {
      const res = await api.history.detail(w);
      setMembers(res.members || []);
    } finally {
      setLoadingWeek(false);
    }
    resetLottery();
  };

  const spawnConfetti = () => {
    const newParticles: Particle[] = Array.from({ length: 32 }, (_, i) => ({
      id: particleIdRef.current++,
      x: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.3,
      size: 6 + Math.random() * 8,
      duration: 1.0 + Math.random() * 0.6,
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 2000);
  };

  const handleDrawCountChange = (n: number) => {
    setDrawCount(Math.min(Math.max(1, n), maxDraw || 1));
  };

  const handleDrawTimeChange = (n: number) => {
    setDrawTime(Math.min(Math.max(1, n), 10));
  };

  const runSlot = (poolMembers: Member[], target: Member, onDone: () => void) => {
    const totalMs = drawTime * 1000;
    const spinMs = totalMs * SPIN_RATIO;
    const pauseMs = totalMs * PAUSE_AFTER_WIN_RATIO;
    const avgInterval = spinMs / SLOT_FRAMES;
    const intervalStart = avgInterval * 0.4;
    const intervalEnd = avgInterval * 1.6;
    let frame = 0;
    setIsWinner(false);

    const tick = () => {
      frame++;
      const ratio = frame / SLOT_FRAMES;
      if (frame >= SLOT_FRAMES) {
        setSlotName(target.name);
        setIsWinner(true);
        spawnConfetti();
        slotTimerRef.current = setTimeout(() => {
          setIsWinner(false);
          onDone();
        }, pauseMs);
        return;
      }
      const randomIdx = Math.floor(Math.random() * poolMembers.length);
      setSlotName(poolMembers[randomIdx].name);
      const interval = intervalStart + (intervalEnd - intervalStart) * ratio;
      slotTimerRef.current = setTimeout(tick, interval);
    };

    tick();
  };

  const startNextDraw = (remainingPool: Member[], alreadyDrawn: Member[]) => {
    const nextIdx = alreadyDrawn.length;
    if (nextIdx >= drawCount) {
      setIsRunning(false);
      setDrawn(alreadyDrawn);
      setShowResult(true);
      return;
    }
    setCurrentDraw(nextIdx + 1);
    const pickIdx = Math.floor(Math.random() * remainingPool.length);
    const target = remainingPool[pickIdx];
    const nextPool = remainingPool.filter((_, i) => i !== pickIdx);
    const nextDrawn = [...alreadyDrawn, target];
    runSlot(remainingPool, target, () => {
      drawnRef.current = nextDrawn;
      startNextDraw(nextPool, nextDrawn);
    });
  };

  const handleStart = () => {
    if (isRunning || maxDraw === 0) return;
    resetLottery();
    setIsRunning(true);
    startNextDraw([...pool], []);
  };

  const handleCopy = () => {
    const weekLabel = weekLabelToKorean(selectedWeek);
    const lines = drawn.map((m, i) => {
      const prefix = getBirthPrefix(m.birth_date);
      return `${i + 1}. ${prefix}${m.name}`;
    }).join('\n');
    navigator.clipboard.writeText(`[${weekLabel} 추첨 결과]\n${lines}`).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  };

  // 1단계: 주차 목록 로드
  const handleQuarterFetch = async () => {
    setLoadingWeekList(true);
    setQuarterWeekData(null);
    setQuarterResult(null);
    setQuarterCopyDone(false);
    setExcludeNote('');

    try {
      const allWeeks = getQuarterWeeks(selectedYear, selectedQuarter);
      const statusWeeks = await api.history.statusWeeks();
      const statusWeeksSet = new Set(statusWeeks);
      const recordedWeeks = allWeeks.filter((w) => statusWeeksSet.has(w));
      const unrecordedWeeks = allWeeks.filter((w) => !statusWeeksSet.has(w));

      setQuarterWeekData({ allWeeks, recordedWeeks, unrecordedWeeks });
      setCheckedWeeks(new Set(recordedWeeks)); // 기본값: 전체 체크
    } finally {
      setLoadingWeekList(false);
    }
  };

  // 체크박스 토글 + excludeNote 자동 입력
  const handleWeekToggle = (week: string, recordedWeeks: string[]) => {
    const next = new Set(checkedWeeks);
    if (next.has(week)) next.delete(week);
    else next.add(week);
    setCheckedWeeks(next);
    setQuarterResult(null);
    setQuarterCopyDone(false);

    const excluded = recordedWeeks.filter((w) => !next.has(w));
    if (excluded.length > 0) {
      const labels = excluded.map((w) => weekLabelToKorean(w).replace(' 주차', ''));
      setExcludeNote(labels.join(', ') + ' 주차');
    } else {
      setExcludeNote('');
    }
  };

  // 2단계: 체크된 주차 기준으로 멤버 계산
  const handleQuarterCalc = async () => {
    if (!quarterWeekData) return;
    setLoadingQuarter(true);
    setQuarterResult(null);
    setQuarterCopyDone(false);

    const { allWeeks, unrecordedWeeks } = quarterWeekData;
    const selectedWeeks = quarterWeekData.recordedWeeks.filter((w) => checkedWeeks.has(w));

    try {
      if (selectedWeeks.length === 0) {
        setQuarterResult({ allWeeks, recordedWeeks: selectedWeeks, unrecordedWeeks, topMembers: [] });
        return;
      }

      const allMembers: any[] = await api.members.list();
      const activeMembers = allMembers.filter((m) => m.is_active !== false);

      const details = await Promise.all(
        selectedWeeks.map((w) => api.history.detail(w))
      );

      const injeungSets: Set<string>[] = details.map((d) => {
        const s = new Set<string>();
        (d.members || []).forEach((m: any) => {
          if (m.status === 'injeung' || m.is_exclude_but_certified) s.add(m.name);
        });
        return s;
      });

      const getYear = (bd?: string | null) => {
        if (!bd) return 9999;
        const parts = bd.split('-');
        const y = parseInt(parts[0], 10);
        return parts[0].length <= 2 ? (y <= 29 ? 2000 + y : 1900 + y) : y;
      };

      const topMembers = activeMembers
        .filter((m) => injeungSets.every((s) => s.has(m.name)))
        .sort((a, b) => {
          const ya = getYear(a.birth_date);
          const yb = getYear(b.birth_date);
          if (ya !== yb) return ya - yb;
          return a.name.localeCompare(b.name, 'ko');
        })
        .map((m) => ({ name: m.name, birth_date: m.birth_date }));

      setQuarterResult({ allWeeks, recordedWeeks: selectedWeeks, unrecordedWeeks, topMembers });
    } finally {
      setLoadingQuarter(false);
    }
  };

  const handleQuarterCopy = () => {
    if (!quarterResult) return;

    const QUARTER_MONTHS: Record<number, string> = {
      1: '1월~3월', 2: '4월~6월', 3: '7월~9월', 4: '10월~12월',
    };
    const monthRange = QUARTER_MONTHS[selectedQuarter];
    const q = selectedQuarter;
    const recordedCount = quarterResult.recordedWeeks.length;
    const memberCount = quarterResult.topMembers.length;

    const weekDesc = excludeNote.trim()
      ? `${excludeNote.trim()}를 제외한 총 ${recordedCount}주`
      : `총 ${recordedCount}주`;

    const memberLines = quarterResult.topMembers.map((m, i) => {
      const prefix = getBirthPrefix(m.birth_date);
      return `${i + 1}. ${prefix}${m.name}`;
    }).join('\n');

    const text = [
      `🏅 ${q}분기(${monthRange}) 운동개근상 후보 리스트 안내 🏅`,
      '',
      `${q}분기(${monthRange})는 ${weekDesc} 동안 모두 운동 인증을 완료한 인원 ${memberCount}명이 후보로 선정되었습니다.`,
      '',
      '명단에 대해 궁금하신 점이나 이의가 있으신 분은 언제든지 연락 주세요.',
      '',
      `📋 ${q}분기 운동 개근상 후보 명단 (${memberCount}명)`,
      '',
      memberLines,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setQuarterCopyDone(true);
      setTimeout(() => setQuarterCopyDone(false), 2000);
    });
  };

  return (
    <div>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(340px) rotate(720deg); opacity: 0; }
        }
        @keyframes winnerBounce {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); }
          80%  { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes winnerGlow {
          0%, 100% { text-shadow: 0 0 8px #f97316, 0 0 20px #fb923c; }
          50%       { text-shadow: 0 0 20px #f97316, 0 0 50px #fbbf24; }
        }
      `}</style>

      <h2 className="text-xl font-bold mb-4">추첨</h2>

      {/* 서브탭 */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('weekly')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'weekly'
              ? 'border-corgi text-corgi'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          주차 추첨
        </button>
        <button
          onClick={() => setActiveTab('quarter')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'quarter'
              ? 'border-corgi text-corgi'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          분기 우수 인증자
        </button>
      </div>

      {/* 주차 추첨 탭 */}
      {activeTab === 'weekly' && (
        <>
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">주차 선택</label>
            <select
              value={selectedWeek}
              onChange={(e) => handleWeekChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">-- 주차를 선택하세요 --</option>
              {weeks.map((w) => (
                <option key={w} value={w}>{weekLabelToKorean(w)} ({w})</option>
              ))}
            </select>
            {loadingWeek && <p className="text-sm text-gray-400 mt-1">불러오는 중...</p>}
          </div>

          {selectedWeek && !loadingWeek && (
            <>
              <div className="bg-white rounded-lg shadow p-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">추첨 대상 상태</p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={filterStatus[key]}
                        onChange={() => {
                          setFilterStatus((prev) => ({ ...prev, [key]: !prev[key] }));
                          resetLottery();
                        }}
                        className="rounded"
                      />
                      <span>{label}</span>
                      <span className="text-gray-400 text-xs">
                        ({members.filter((m) => m.is_active !== false && m.status === key).length}명)
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  대상 인원: <span className="font-semibold text-corgi">{maxDraw}명</span>
                </p>
              </div>

              <div className="bg-white rounded-lg shadow p-4 mb-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">추첨 인원 수</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDrawCountChange(drawCount - 1)}
                      disabled={drawCount <= 1}
                      className="w-8 h-8 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 font-bold"
                    >-</button>
                    <input
                      type="number"
                      min={1}
                      max={maxDraw}
                      value={drawCount}
                      onChange={(e) => handleDrawCountChange(parseInt(e.target.value) || 1)}
                      className="w-14 text-center border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleDrawCountChange(drawCount + 1)}
                      disabled={drawCount >= maxDraw}
                      className="w-8 h-8 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 font-bold"
                    >+</button>
                    <span className="text-xs text-gray-400">명</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">한명당 시간 (초)</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDrawTimeChange(drawTime - 1)}
                      disabled={drawTime <= 1}
                      className="w-8 h-8 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 font-bold"
                    >-</button>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={drawTime}
                      onChange={(e) => handleDrawTimeChange(parseInt(e.target.value) || 2)}
                      className="w-14 text-center border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleDrawTimeChange(drawTime + 1)}
                      disabled={drawTime >= 10}
                      className="w-8 h-8 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 font-bold"
                    >+</button>
                    <span className="text-xs text-gray-400">초</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6 mb-4 text-center relative overflow-hidden">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      position: 'absolute',
                      left: `${p.x}%`,
                      top: 0,
                      width: p.size,
                      height: p.size,
                      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                      backgroundColor: p.color,
                      animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {isRunning ? (
                  <>
                    <p className="text-sm text-gray-500 mb-2">
                      {currentDraw} / {drawCount}
                    </p>
                    <div
                      className="py-8 min-h-[100px] flex items-center justify-center"
                      style={isWinner ? {
                        background: 'linear-gradient(135deg, #fff7ed, #fffbeb)',
                        borderRadius: '12px',
                        transition: 'background 0.3s',
                      } : {}}
                    >
                      <span
                        style={isWinner ? {
                          fontSize: '3rem',
                          fontWeight: 800,
                          color: '#ea580c',
                          animation: 'winnerBounce 0.5s ease-out, winnerGlow 1s ease-in-out infinite',
                          display: 'inline-block',
                        } : {
                          fontSize: '2.5rem',
                          fontWeight: 700,
                          color: '#f97316',
                        }}
                      >
                        {slotName}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">
                      {isWinner ? '당첨!' : '추첨 중...'}
                    </p>
                  </>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={maxDraw === 0}
                    className="px-8 py-3 bg-corgi text-white rounded-lg font-semibold text-base hover:bg-corgi-dark transition disabled:opacity-40"
                  >
                    추첨 시작
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* 분기 우수 인증자 탭 */}
      {activeTab === 'quarter' && (
        <>
          {/* 분기 선택 */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <p className="text-sm font-medium text-gray-700 mb-3">분기 선택</p>
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">연도</label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(parseInt(e.target.value, 10));
                    setQuarterWeekData(null);
                    setQuarterResult(null);
                    setExcludeNote('');
                  }}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">분기</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => {
                    setSelectedQuarter(parseInt(e.target.value, 10));
                    setQuarterWeekData(null);
                    setQuarterResult(null);
                    setExcludeNote('');
                  }}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>{q}분기</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleQuarterFetch}
                  disabled={loadingWeekList}
                  className="px-4 py-2 bg-corgi text-white rounded text-sm font-medium hover:bg-corgi-dark transition disabled:opacity-40"
                >
                  {loadingWeekList ? '불러오는 중...' : '조회'}
                </button>
              </div>
            </div>
          </div>

          {/* 주차 체크박스 + 계산 버튼 */}
          {quarterWeekData && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">
                  {selectedYear}년 {selectedQuarter}분기 주차 현황
                </p>
                <div className="flex gap-2 text-xs text-gray-500">
                  <span>전체 <b className="text-gray-700">{quarterWeekData.allWeeks.length}주</b></span>
                  <span>정산 완료 <b className="text-green-600">{quarterWeekData.recordedWeeks.length}주</b></span>
                  {quarterWeekData.unrecordedWeeks.length > 0 && (
                    <span>미완료 <b className="text-gray-400">{quarterWeekData.unrecordedWeeks.length}주</b></span>
                  )}
                </div>
              </div>

              {/* 정산 완료 주차 체크박스 */}
              {quarterWeekData.recordedWeeks.length > 0 ? (
                <div className="space-y-1 mb-3">
                  <p className="text-xs text-gray-500 mb-1">계산에 포함할 주차 선택</p>
                  {quarterWeekData.recordedWeeks.map((w) => (
                    <label key={w} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkedWeeks.has(w)}
                        onChange={() => handleWeekToggle(w, quarterWeekData.recordedWeeks)}
                        className="rounded"
                      />
                      <span className={checkedWeeks.has(w) ? 'text-gray-800' : 'text-gray-400 line-through'}>
                        {weekLabelToKorean(w)}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-3">해당 분기에 정산 완료된 주차가 없습니다.</p>
              )}

              {/* 미완료 주차 */}
              {quarterWeekData.unrecordedWeeks.length > 0 && (
                <div className="bg-gray-50 rounded p-2 mb-3">
                  <p className="text-xs text-gray-500 mb-1">미완료 주차 (자동 제외)</p>
                  <div className="flex flex-wrap gap-1">
                    {quarterWeekData.unrecordedWeeks.map((w) => (
                      <span key={w} className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded">
                        {weekLabelToKorean(w)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleQuarterCalc}
                disabled={loadingQuarter || checkedWeeks.size === 0}
                className="w-full py-2 bg-corgi text-white rounded font-medium text-sm hover:bg-corgi-dark transition disabled:opacity-40"
              >
                {loadingQuarter ? '계산 중...' : `선택한 ${checkedWeeks.size}주 기준으로 계산`}
              </button>
            </div>
          )}

          {/* 계산 결과 */}
          {quarterResult && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-1">
                전체 인증자
                <span className="ml-2 text-corgi font-bold">{quarterResult.topMembers.length}명</span>
                <span className="text-xs text-gray-400 ml-1">
                  ({quarterResult.recordedWeeks.length}주 모두 인증)
                </span>
              </p>

              {quarterResult.topMembers.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">모든 주차를 인증한 멤버가 없습니다.</p>
              ) : (
                <ol className="space-y-1 mt-2 mb-4">
                  {quarterResult.topMembers.map((m, i) => (
                    <li key={m.name} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-corgi text-white text-xs flex items-center justify-center font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-medium">{getBirthPrefix(m.birth_date)}{m.name}</span>
                    </li>
                  ))}
                </ol>
              )}

              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    제외 사유 — 체크 해제 시 자동 입력, 직접 수정 가능
                  </label>
                  <input
                    type="text"
                    value={excludeNote}
                    onChange={(e) => setExcludeNote(e.target.value)}
                    placeholder="비워두면 '총 N주 동안' 형태로 복사"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  onClick={handleQuarterCopy}
                  disabled={quarterResult.topMembers.length === 0}
                  className="w-full py-2 border border-corgi text-corgi rounded font-medium text-sm hover:bg-corgi hover:text-white transition disabled:opacity-40"
                >
                  {quarterCopyDone ? '복사됨!' : '명단 텍스트 복사'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 주차 추첨 결과 팝업 */}
      {showResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-1 text-center">추첨 완료!</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              {weekLabelToKorean(selectedWeek)}
            </p>
            <ol className="space-y-1 mb-4">
              {drawn.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-corgi text-white text-xs flex items-center justify-center font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-medium">{getBirthPrefix(m.birth_date)}{m.name}</span>
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-2 border border-corgi text-corgi rounded font-medium text-sm hover:bg-corgi hover:text-white transition"
              >
                {copyDone ? '복사됨!' : '텍스트 복사'}
              </button>
              <button
                onClick={() => { setShowResult(false); resetLottery(); }}
                className="flex-1 py-2 bg-corgi text-white rounded font-medium text-sm hover:bg-corgi-dark transition"
              >
                다시 추첨
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
