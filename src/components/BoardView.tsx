import React, { useMemo, useState } from 'react';
import { Bomb, Eye, Flag, Play, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { CellData, DopamineMetrics, GameStatus, InputMode } from '../game/types';
import { getNeighbors } from '../game/engine';

interface BoardViewProps {
  board: CellData[][];
  status: GameStatus;
  inputMode: InputMode;
  isFever: boolean;
  shakeOffset: { x: number; y: number };
  boardPunchScale: number;
  lastScannedCell: { row: number; col: number } | null;
  dopamine: DopamineMetrics;
  elapsedSeconds: number;
  minesRemaining: number;
  safeCellsTotal: number;
  safeCellsCleared: number;
  onCellPrimaryAction: (
    row: number,
    col: number,
    clientX: number,
    clientY: number,
    cellStepPx: number
  ) => void;
  onCellSecondaryAction: (row: number, col: number, clientX: number, clientY: number) => void;
  onRestart: () => void;
  onOpenConfig: () => void;
}

const GRID_GAP_PX = 3;

const NUMBER_COLORS: Record<number, string> = {
  1: 'text-sky-400',
  2: 'text-emerald-400',
  3: 'text-rose-400',
  4: 'text-violet-300',
  5: 'text-amber-300',
  6: 'text-teal-300',
  7: 'text-pink-300',
  8: 'text-slate-200',
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function BoardView({
  board,
  status,
  inputMode,
  isFever,
  shakeOffset,
  boardPunchScale,
  lastScannedCell,
  dopamine,
  elapsedSeconds,
  safeCellsTotal,
  safeCellsCleared,
  onCellPrimaryAction,
  onCellSecondaryAction,
  onRestart,
  onOpenConfig,
}: BoardViewProps) {
  const rows = board.length;
  const cols = board[0]?.length ?? 9;

  const [chordPreviewCenter, setChordPreviewCenter] = useState<{ row: number; col: number } | null>(
    null
  );
  const [inspectingBoard, setInspectingBoard] = useState(false);
  const [resultReady, setResultReady] = useState(false);

  React.useEffect(() => {
    if (status === 'IDLE' || status === 'PLAYING') {
      setInspectingBoard(false);
      setResultReady(false);
      return;
    }
    if (status === 'WON') {
      setResultReady(true);
      return;
    }
    // On mine detonation (LOST), showcase the full 3-second supernova explosion & board before result modal
    setResultReady(false);
    const timer = window.setTimeout(() => {
      setResultReady(true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const cellPx = useMemo(() => {
    if (cols <= 10 && rows <= 10) return 44;
    if (cols <= 14 && rows <= 14) return 38;
    if (cols <= 18 && rows <= 16) return 34;
    if (cols <= 24) return 31;
    return 28;
  }, [cols, rows]);

  const cellStepPx = cellPx + GRID_GAP_PX;

  const chordHighlightSet = useMemo(() => {
    const set = new Set<string>();
    if (!chordPreviewCenter) return set;
    const { row, col } = chordPreviewCenter;
    const center = board[row]?.[col];
    if (!center || !center.isRevealed || center.adjacentMines === 0) return set;
    for (const [nr, nc] of getNeighbors(rows, cols, row, col)) {
      const nb = board[nr][nc];
      if (!nb.isRevealed && !nb.isFlagged) {
        set.add(`${nr},${nc}`);
      }
    }
    return set;
  }, [chordPreviewCenter, board, rows, cols]);

  const handleContextMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    row: number,
    col: number
  ) => {
    e.preventDefault();
    if (status === 'WON' || status === 'LOST') return;
    const rect = e.currentTarget.getBoundingClientRect();
    onCellSecondaryAction(row, col, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    row: number,
    col: number
  ) => {
    if (status === 'WON' || status === 'LOST') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const cell = board[row][col];

    if (inputMode === 'flag' && !cell.isRevealed) {
      onCellSecondaryAction(row, col, cx, cy);
    } else {
      onCellPrimaryAction(row, col, cx, cy, cellStepPx);
    }
  };

  const handleMouseDown = (
    e: React.MouseEvent<HTMLButtonElement>,
    row: number,
    col: number
  ) => {
    if (e.button !== 0 || status === 'WON' || status === 'LOST') return;
    const cell = board[row][col];
    if (cell.isRevealed && cell.adjacentMines > 0) {
      setChordPreviewCenter({ row, col });
    }
  };

  const clearChordPreview = () => {
    if (chordPreviewCenter) setChordPreviewCenter(null);
  };

  const progressPct =
    safeCellsTotal > 0 ? Math.round((safeCellsCleared / safeCellsTotal) * 100) : 0;

  const isGameEnded = status === 'WON' || status === 'LOST';

  return (
    <div
      className="relative mx-auto flex w-full flex-col items-center"
      onMouseUp={clearChordPreview}
      onMouseLeave={clearChordPreview}
    >
      {/* Shake & Impact-Punch Orbital Frame */}
      <div
        style={{
          transform: `translate3d(${shakeOffset.x}px, ${shakeOffset.y}px, 0) scale(${boardPunchScale})`,
          transition: 'transform 90ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`relative max-w-full rounded-2xl border p-3 transition-colors duration-200 sm:p-4 ${
          isFever
            ? 'border-amber-400/85 bg-[#121829]/92 shadow-[0_0_54px_-10px_rgba(245,158,11,0.5)]'
            : status === 'LOST'
              ? 'border-rose-500/60 bg-[#140F1C]/92 shadow-2xl'
              : status === 'WON'
                ? 'border-emerald-400/70 bg-[#0D1A24]/92 shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)]'
                : 'border-slate-800/90 bg-[#0F1626]/90 shadow-2xl'
        } backdrop-blur-md`}
      >
        {/* Top Progress Strip */}
        <div
          className="mb-3 flex items-center justify-between gap-4 px-1 text-xs text-slate-400"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 font-mono-tabular">
            <span>開拓率 {progressPct}%</span>
            <span aria-hidden="true">·</span>
            <span>
              {safeCellsCleared} / {safeCellsTotal} マス
            </span>
          </div>
          <div className="hidden text-xs text-slate-400 sm:block">
            {status === 'IDLE'
              ? '最初の1クリックは必ず安全に開きます'
              : status === 'PLAYING'
                ? '連鎖やコード一斉開放で5段階エフェクトが発動'
                : status === 'WON'
                  ? '全宙域の安全確認が完了しました'
                  : '機雷を起爆しました'}
          </div>
        </div>

        {/* Scrollable Board Container */}
        <div className="max-w-full overflow-x-auto pb-1">
          <div
            role="grid"
            aria-label="宇宙マインスイーパー盤面"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${rows}, ${cellPx}px)`,
              gap: `${GRID_GAP_PX}px`,
            }}
            className="mx-auto grid w-max rounded-xl bg-[#070B14]/90 p-2 select-none"
          >
            {board.map((rowArr) =>
              rowArr.map((cell) => {
                const key = `${cell.row}-${cell.col}`;
                const isChordHighlighted = chordHighlightSet.has(`${cell.row},${cell.col}`);
                const isRecentlyScanned =
                  lastScannedCell?.row === cell.row && lastScannedCell?.col === cell.col;

                const fontSize = cellPx >= 40 ? 'text-lg' : cellPx >= 34 ? 'text-base' : 'text-sm';

                if (!cell.isRevealed) {
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      aria-label={`行${cell.row + 1} 列${cell.col + 1} ${
                        cell.isFlagged ? '旗あり' : '未探索'
                      }`}
                      onClick={(e) => handleClick(e, cell.row, cell.col)}
                      onContextMenu={(e) => handleContextMenu(e, cell.row, cell.col)}
                      className={`group relative flex items-center justify-center rounded-[6px] border transition-transform duration-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-amber-400 active:scale-90 ${
                        cell.wrongFlag
                          ? 'border-rose-500/70 bg-rose-950/70'
                          : isChordHighlighted
                            ? 'border-sky-300/80 bg-sky-400/25 scale-[0.94]'
                            : cell.isFlagged
                              ? 'border-rose-400/50 bg-[#1D243B] hover:bg-[#232B45]'
                              : isFever
                                ? 'border-amber-400/40 bg-[#1B2540] hover:border-amber-300/80 hover:bg-[#243154]'
                                : 'border-slate-700/80 bg-[#182238] hover:border-sky-400/70 hover:bg-[#212F4D]'
                      } shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]`}
                    >
                      {cell.isFlagged && (
                        <span className="animate-flag-lock relative flex items-center justify-center">
                          <Flag
                            className={`h-4 w-4 ${
                              cell.wrongFlag ? 'text-rose-300' : 'text-rose-400 fill-rose-400/35'
                            }`}
                          />
                          {cell.wrongFlag && (
                            <X className="absolute h-5 w-5 text-rose-200 stroke-[2.5]" />
                          )}
                        </span>
                      )}
                    </button>
                  );
                }

                // Revealed Mine
                if (cell.isMine) {
                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-label={`行${cell.row + 1} 列${cell.col + 1} 地雷`}
                      className={`animate-mine-detonate flex items-center justify-center rounded-[6px] border ${
                        cell.detonated
                          ? 'border-rose-400 bg-rose-500/35 text-rose-100'
                          : 'border-rose-500/35 bg-[#1B1222] text-rose-400'
                      }`}
                    >
                      <Bomb className="h-4 w-4" />
                    </div>
                  );
                }

                // Revealed Safe Cell with synchronized luminous flash-wave layer
                const numColor = NUMBER_COLORS[cell.adjacentMines] ?? 'text-slate-200';
                const waveDelay = `${cell.waveOrder * 18}ms`;

                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    aria-label={`行${cell.row + 1} 列${cell.col + 1} ${
                      cell.adjacentMines === 0
                        ? '安全空白'
                        : `周囲地雷${cell.adjacentMines}`
                    }`}
                    style={{
                      animationDelay: waveDelay,
                    }}
                    onClick={(e) => handleClick(e, cell.row, cell.col)}
                    onMouseDown={(e) => handleMouseDown(e, cell.row, cell.col)}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`animate-tile-pop relative flex items-center justify-center overflow-visible rounded-[6px] border font-mono-tabular font-bold transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-amber-400 ${fontSize} ${
                      isRecentlyScanned
                        ? 'border-sky-400/80 bg-sky-950/70'
                        : cell.adjacentMines > 0
                          ? 'border-slate-800/80 bg-[#0C1324] hover:border-slate-700 hover:bg-[#111B32] cursor-pointer'
                          : 'border-slate-900/80 bg-[#090E1B] cursor-default'
                    }`}
                  >
                    {/* Synchronized Luminous Impact Wave Flash on every newly opened cell */}
                    <span
                      aria-hidden="true"
                      style={{ animationDelay: waveDelay }}
                      className={`animate-tile-flash pointer-events-none absolute inset-0 rounded-[6px] ${
                        isFever
                          ? 'bg-gradient-to-br from-amber-300/90 via-yellow-200/70 to-sky-300/60'
                          : 'bg-gradient-to-br from-sky-300/85 via-cyan-200/55 to-amber-200/40'
                      }`}
                    />
                    {cell.adjacentMines > 0 ? (
                      <span className={`relative z-10 ${numColor}`}>{cell.adjacentMines}</span>
                    ) : (
                      <span
                        className="relative z-10 h-1 w-1 rounded-full bg-slate-800"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Floating Re-open Result Button when inspecting completed board */}
        {isGameEnded && resultReady && inspectingBoard && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0A101D]/90 px-4 py-2.5">
            <span className="text-xs font-medium text-slate-300">
              {status === 'WON' ? 'クリア盤面を確認中' : '被弾後の盤面を確認中'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInspectingBoard(false)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
              >
                結果を表示
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 whitespace-nowrap"
              >
                もう一度プレイ
              </button>
            </div>
          </div>
        )}

        {/* Victory / Game Over Modal Overlay */}
        {isGameEnded && resultReady && !inspectingBoard && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={status === 'WON' ? '宙域クリア結果' : 'ゲームオーバー結果'}
            className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[#070B14]/78 p-4 backdrop-blur-[3px]"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-700/90 bg-[#0F1626] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <p
                  className={`text-xs font-bold tracking-wider ${
                    status === 'WON' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {status === 'WON' ? 'SECTOR CLEARED' : 'SUPERNOVA IMPACT'}
                </p>
                {status === 'WON' && <Sparkles className="h-4 w-4 text-amber-400" />}
              </div>

              <h3 className="font-display mt-1 text-2xl font-bold text-slate-50">
                {status === 'WON' ? '宙域クリア達成' : '機雷を起爆しました'}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {status === 'WON'
                  ? 'すべての安全宙域を開拓しました。記録が保存されました。'
                  : '盤面を確認して次の挑戦でハイスコアを更新しましょう。'}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-800 py-4">
                <div>
                  <span className="text-xs text-slate-400">最終スコア</span>
                  <p className="font-mono-tabular mt-0.5 text-xl font-bold text-amber-300">
                    {dopamine.score.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">クリアタイム</span>
                  <p className="font-mono-tabular mt-0.5 text-xl font-bold text-slate-100">
                    {formatTime(elapsedSeconds)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">最大コンボ</span>
                  <p className="font-mono-tabular mt-0.5 text-lg font-bold text-sky-300">
                    {dopamine.maxCombo}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">フィーバー突入</span>
                  <p className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-200">
                    {dopamine.feverTriggers} 回
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onRestart}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap"
                >
                  <Play className="h-4 w-4 fill-current" />
                  もう一度プレイ
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setInspectingBoard(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    盤面を確認
                  </button>
                  <button
                    type="button"
                    onClick={onOpenConfig}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    設定を変更
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
