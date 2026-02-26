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
}

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  duration: number;
}

const SLOT_FRAMES = 30;
// 전체 추첨 시간(ms) 중 회전에 쓸 비율
const SPIN_RATIO = 0.65;
// 당첨자 이름 표시 후 멈춰있는 시간 (ms)
const PAUSE_AFTER_WIN_RATIO = 0.35;

const CONFETTI_COLORS = [
  '#f97316', '#fb923c', '#fbbf24', '#fcd34d', '#fef08a',
  '#fdba74', '#fed7aa', '#ffffff',
];


export default function LotteryPage() {
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
  const [drawTime, setDrawTime] = useState(2); // 한 명당 추첨 시간 (초)
const [isRunning, setIsRunning] = useState(false);
  const [currentDraw, setCurrentDraw] = useState(0);
  const [slotName, setSlotName] = useState('');
  const [isWinner, setIsWinner] = useState(false); // 당첨자 이름 표시 중
  const [drawn, setDrawn] = useState<Member[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);

  const slotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawnRef = useRef<Member[]>([]);
  const particleIdRef = useRef(0);

  useEffect(() => {
    api.history.weeks().then(setWeeks);
  }, []);

  const pool = members.filter((m) => filterStatus[m.status]);
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

  const getBirthPrefix = (birth_date?: string | null): string => {
    if (!birth_date) return '';
    const yearPart = birth_date.split('-')[0];
    return yearPart.slice(-2);
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

  // 슬롯 애니메이션: drawTime 기반으로 간격 계산
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

  return (
    <div>
      {/* 당첨 애니메이션 keyframe 정의 */}
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

      {/* 주차 선택 */}
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
          {/* 추첨 대상 필터 */}
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
                    ({members.filter((m) => m.status === key).length}명)
                  </span>
                </label>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              대상 인원: <span className="font-semibold text-corgi">{maxDraw}명</span>
            </p>
          </div>

          {/* 추첨 인원 수 + 한명당 시간 (2열) */}
          <div className="bg-white rounded-lg shadow p-4 mb-4 grid grid-cols-2 gap-4">
            {/* 좌: 추첨 인원 수 */}
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

            {/* 우: 한명당 시간 */}
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

{/* 추첨 영역 */}
          <div className="bg-white rounded-lg shadow p-6 mb-4 text-center relative overflow-hidden">
            {/* 콘페티 파티클 */}
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

      {/* 결과 팝업 */}
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
