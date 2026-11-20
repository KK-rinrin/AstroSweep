import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Flag,
  Radar,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  ActiveTab,
  BOARD_PRESETS,
  BoardConfig,
  CellData,
  DopamineMetrics,
  FxIntensity,
  GameStatus,
  InputMode,
  RecordsSummary,
} from './game/types';
import {
  chordReveal,
  countFlags,
  countRevealedSafe,
  createEmptyBoard,
  findSafeScanTarget,
  getComboMultiplier,
  getDensityInfo,
  getInitialScannerCharges,
  populateMines,
  revealCell,
  toggleFlag,
} from './game/engine';
import { soundEngine } from './game/soundEngine';
import { CellScreenPoint, EffectTier, vfxBus } from './game/vfxBus';
import {
  clearRecords,
  loadRecords,
  loadSavedConfig,
  saveConfig,
  saveGameRecord,
} from './game/storage';
import { CosmicCanvas } from './components/CosmicCanvas';
import { BoardView } from './components/BoardView';
import { FieldConfigPanel } from './components/FieldConfigPanel';
import { RecordsPanel } from './components/RecordsPanel';

const COMBO_DURATION_MS = 4200;
const FEVER_DURATION_MS = 8000;
const COMBO_RECOVERY_STEP = 5;
const COSMIC_BACKDROP_URL = '/src/assets/images/cosmic_nebula_backdrop_1795066935733.jpg';

function createInitialDopamine(config: BoardConfig): DopamineMetrics {
  const initialCharges = getInitialScannerCharges(config.cols, config.rows, config.mines);
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    comboTimerRatio: 0,
    multiplier: 1,
    feverGauge: 0,
    isFever: false,
    feverRemainingRatio: 0,
    feverTriggers: 0,
    scannerCharges: initialCharges,
    scannerMaxCharges: initialCharges,
    scannerComboStep: 0,
  };
}

const TIER_METADATA: Record<EffectTier, { title?: string; color: string; shake: number; punch: number }> = {
  1: { title: undefined, color: '#38BDF8', shake: 1.4, punch: 1.004 },
  2: { title: 'TIER 2 · PLASMA', color: '#38BDF8', shake: 3.2, punch: 1.009 },
  3: { title: 'TIER 3 · NOVA WAVE', color: '#34D399', shake: 5.5, punch: 1.015 },
  4: { title: 'TIER 4 · GALAXY SLASH', color: '#F59E0B', shake: 8.2, punch: 1.022 },
  5: { title: 'TIER 5 · BIG BANG', color: '#FDE047', shake: 11.5, punch: 1.03 },
};

/**
 * Systematic 5-Tier Effect Classifier:
 * Escalates cleanly based on simultaneous cleared count, chord burst, combo streak, high-risk digits, and Fever state.
 */
function resolveEffectTier(params: {
  count: number;
  isChord: boolean;
  combo: number;
  isFever: boolean;
  justTriggeredFever: boolean;
  maxAdjacentRevealed: number;
}): EffectTier {
  const { count, isChord, combo, isFever, justTriggeredFever, maxAdjacentRevealed } = params;

  if (justTriggeredFever || count >= 26 || (isFever && isChord && count >= 8)) {
    return 5;
  }
  if (count >= 14 || (isChord && count >= 5) || (isFever && count >= 6) || combo >= 18) {
    return 4;
  }
  if (count >= 6 || isChord || isFever || combo >= 8) {
    return 3;
  }
  if (count >= 2 || combo >= 3 || maxAdjacentRevealed >= 4) {
    return 2;
  }
  return 1;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getPresetDisplayName(config: BoardConfig): string {
  const preset = BOARD_PRESETS.find((p) => p.id === config.presetId);
  return preset ? preset.name : 'カスタム';
}

export default function App() {
  const [config, setConfig] = useState<BoardConfig>(() => loadSavedConfig());
  const [activeTab, setActiveTab] = useState<ActiveTab>('play');
  const [board, setBoard] = useState<CellData[][]>(() =>
    createEmptyBoard(config.rows, config.cols)
  );
  const [status, setStatus] = useState<GameStatus>('IDLE');
  const [inputMode, setInputMode] = useState<InputMode>('dig');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fxIntensity, setFxIntensity] = useState<FxIntensity>('full');
  const [backdropLoaded, setBackdropLoaded] = useState(true);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [dopamine, setDopamine] = useState<DopamineMetrics>(() => createInitialDopamine(config));
  const [displayScore, setDisplayScore] = useState(0);
  const [scoreBumpKey, setScoreBumpKey] = useState(0);
  const [lastTier, setLastTier] = useState<EffectTier>(1);
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 });
  const [boardPunchScale, setBoardPunchScale] = useState(1);
  const [lastScannedCell, setLastScannedCell] = useState<{ row: number; col: number } | null>(
    null
  );
  const [records, setRecords] = useState<RecordsSummary>(() => loadRecords());

  const scoreHudRef = useRef<HTMLParagraphElement | null>(null);
  const comboDeadlineRef = useRef<number>(0);
  const feverDeadlineRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const shakeTimeoutRef = useRef<number | null>(null);
  const punchTimeoutRef = useRef<number | null>(null);
  const finaleShakeTimeoutRef = useRef<number | null>(null);
  const dopamineRef = useRef<DopamineMetrics>(dopamine);
  dopamineRef.current = dopamine;

  const statusRef = useRef<GameStatus>(status);
  statusRef.current = status;

  const fxIntensityRef = useRef<FxIntensity>(fxIntensity);
  fxIntensityRef.current = fxIntensity;

  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const triggerShakeAndPunch = useCallback((magnitude: number, punchScale: number, durationMs = 170) => {
    const mode = fxIntensityRef.current;
    if (mode === 'minimal') return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const scaleFactor = mode === 'standard' ? 0.55 : 1;
    const scaledMag = magnitude * scaleFactor;
    const scaledPunch = 1 + (punchScale - 1) * scaleFactor;

    // Tactile board zoom-punch
    if (punchTimeoutRef.current) {
      window.clearTimeout(punchTimeoutRef.current);
    }
    setBoardPunchScale(scaledPunch);
    punchTimeoutRef.current = window.setTimeout(() => {
      setBoardPunchScale(1);
    }, 85);

    if (shakeTimeoutRef.current) {
      window.cancelAnimationFrame(shakeTimeoutRef.current);
    }

    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        setShakeOffset({ x: 0, y: 0 });
        return;
      }
      const decay = 1 - elapsed / durationMs;
      setShakeOffset({
        x: (Math.random() * 2 - 1) * scaledMag * decay,
        y: (Math.random() * 2 - 1) * scaledMag * decay,
      });
      shakeTimeoutRef.current = window.requestAnimationFrame(step);
    };
    shakeTimeoutRef.current = window.requestAnimationFrame(step);
  }, []);

  const handleOrbArrive = useCallback(() => {
    setScoreBumpKey((k) => k + 1);
  }, []);

  // Rolling odometer score animation
  useEffect(() => {
    if (displayScore === dopamine.score) return;
    let raf = 0;
    const tick = () => {
      setDisplayScore((prev) => {
        const diff = dopamine.score - prev;
        if (Math.abs(diff) <= 3) return dopamine.score;
        return prev + Math.ceil(diff * 0.25);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dopamine.score, displayScore]);

  // Active gameplay loop for timer, combo decay, and fever countdown
  useEffect(() => {
    if (status !== 'PLAYING') return;
    const interval = window.setInterval(() => {
      const now = performance.now();
      setElapsedSeconds((now - startTimeRef.current) / 1000);

      setDopamine((prev) => {
        let nextCombo = prev.combo;
        let nextComboRatio = 0;
        if (prev.combo > 0 && comboDeadlineRef.current > 0) {
          const remaining = comboDeadlineRef.current - now;
          if (remaining <= 0) {
            nextCombo = 0;
            nextComboRatio = 0;
          } else {
            nextComboRatio = Math.min(1, remaining / COMBO_DURATION_MS);
          }
        }

        let nextIsFever = prev.isFever;
        let nextFeverRatio = prev.feverRemainingRatio;
        let nextFeverGauge = prev.feverGauge;
        if (prev.isFever) {
          const remaining = feverDeadlineRef.current - now;
          if (remaining <= 0) {
            nextIsFever = false;
            nextFeverRatio = 0;
            nextFeverGauge = 0;
          } else {
            nextFeverRatio = Math.min(1, remaining / FEVER_DURATION_MS);
          }
        }

        const nextMult = getComboMultiplier(nextCombo, nextIsFever);

        if (
          nextCombo === prev.combo &&
          Math.abs(nextComboRatio - prev.comboTimerRatio) < 0.01 &&
          nextIsFever === prev.isFever &&
          Math.abs(nextFeverRatio - prev.feverRemainingRatio) < 0.01 &&
          nextFeverGauge === prev.feverGauge
        ) {
          return prev;
        }

        return {
          ...prev,
          combo: nextCombo,
          comboTimerRatio: nextComboRatio,
          multiplier: nextMult,
          isFever: nextIsFever,
          feverRemainingRatio: nextFeverRatio,
          feverGauge: nextFeverGauge,
          scannerComboStep: nextCombo % COMBO_RECOVERY_STEP,
        };
      });
    }, 60);

    return () => window.clearInterval(interval);
  }, [status]);

  const startNewGame = useCallback((nextConfig: BoardConfig) => {
    if (finaleShakeTimeoutRef.current) {
      window.clearTimeout(finaleShakeTimeoutRef.current);
      finaleShakeTimeoutRef.current = null;
    }
    vfxBus.emit({ type: 'reset' });
    saveConfig(nextConfig);
    setConfig(nextConfig);
    setBoard(createEmptyBoard(nextConfig.rows, nextConfig.cols));
    setStatus('IDLE');
    setElapsedSeconds(0);
    setDopamine(createInitialDopamine(nextConfig));
    setDisplayScore(0);
    setLastTier(1);
    setLastScannedCell(null);
    comboDeadlineRef.current = 0;
    feverDeadlineRef.current = 0;
    setActiveTab('play');
  }, []);

  const finalizeRun = useCallback(
    (won: boolean, finalBoard: CellData[][], finalMetrics: DopamineMetrics) => {
      const duration =
        startTimeRef.current > 0 ? (performance.now() - startTimeRef.current) / 1000 : 0;
      setElapsedSeconds(duration);

      const safeCleared = countRevealedSafe(finalBoard);
      const speedBonus = won
        ? Math.round(
            Math.max(200, config.mines * 45 - duration * 4) *
              (1 + finalMetrics.maxCombo * 0.04)
          )
        : 0;
      const totalScore = finalMetrics.score + speedBonus;

      const updatedMetrics = {
        ...finalMetrics,
        score: totalScore,
      };
      setDopamine(updatedMetrics);
      if (speedBonus > 0) {
        setScoreBumpKey((k) => k + 1);
      }

      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        playedAt: new Date().toISOString(),
        presetLabel: getPresetDisplayName(config),
        cols: config.cols,
        rows: config.rows,
        mines: config.mines,
        won,
        score: totalScore,
        timeSeconds: duration,
        maxCombo: updatedMetrics.maxCombo,
        feverTriggers: updatedMetrics.feverTriggers,
      };

      setRecords((prev) => saveGameRecord(prev, entry, safeCleared));
    },
    [config]
  );

  const processRevealOutcome = useCallback(
    (
      result: ReturnType<typeof revealCell>,
      originRow: number,
      originCol: number,
      originX: number,
      originY: number,
      cellStepPx: number,
      isChord: boolean,
      isScanner = false
    ) => {
      setBoard(result.board);

      if (result.hitMine) {
        setStatus('LOST');
        soundEngine.playMineExplosion();
        triggerShakeAndPunch(26, 0.96, 860);

        if (finaleShakeTimeoutRef.current) {
          window.clearTimeout(finaleShakeTimeoutRef.current);
        }
        finaleShakeTimeoutRef.current = window.setTimeout(() => {
          triggerShakeAndPunch(30, 0.952, 900);
          finaleShakeTimeoutRef.current = null;
        }, 1920);

        const hitRow = result.hitPosition?.row ?? originRow;
        const hitCol = result.hitPosition?.col ?? originCol;
        const blastX = originX + (hitCol - originCol) * cellStepPx;
        const blastY = originY + (hitRow - originRow) * cellStepPx;

        const otherMines: Array<{ x: number; y: number; dist: number }> = [];
        for (let r = 0; r < result.board.length; r++) {
          for (let c = 0; c < result.board[r].length; c++) {
            if (result.board[r][c].isMine && (r !== hitRow || c !== hitCol)) {
              const mx = blastX + (c - hitCol) * cellStepPx;
              const my = blastY + (r - hitRow) * cellStepPx;
              otherMines.push({
                x: mx,
                y: my,
                dist: Math.hypot(mx - blastX, my - blastY),
              });
            }
          }
        }

        vfxBus.emit({
          type: 'supernova',
          x: blastX,
          y: blastY,
          cellSize: Math.max(24, cellStepPx - 3),
          otherMines,
        });
        finalizeRun(false, result.board, dopamineRef.current);
        return;
      }

      const count = result.revealedCells.length;
      if (count === 0) return;

      const now = performance.now();
      const prev = dopamineRef.current;

      const comboAlive = prev.combo > 0 && comboDeadlineRef.current > now;
      const prevEffectiveCombo = comboAlive ? prev.combo : 0;
      const comboGain = isChord ? Math.max(2, Math.min(4, Math.ceil(count / 3))) : 1;
      const nextCombo = prevEffectiveCombo + comboGain;
      const nextMaxCombo = Math.max(prev.maxCombo, nextCombo);
      comboDeadlineRef.current = now + COMBO_DURATION_MS;

      let nextIsFever = prev.isFever && feverDeadlineRef.current > now;
      let nextFeverGauge = prev.feverGauge;
      let nextFeverTriggers = prev.feverTriggers;
      let justTriggeredFever = false;

      if (!nextIsFever) {
        const gaugeGain = Math.min(48, 8 + count * 2.8 + (isChord ? 10 : 0));
        nextFeverGauge = Math.min(100, prev.feverGauge + gaugeGain);
        if (nextFeverGauge >= 100) {
          nextIsFever = true;
          justTriggeredFever = true;
          nextFeverTriggers += 1;
          feverDeadlineRef.current = now + FEVER_DURATION_MS;
        }
      } else if (count >= 5 || isChord) {
        feverDeadlineRef.current = Math.min(
          now + FEVER_DURATION_MS,
          feverDeadlineRef.current + 650
        );
      }

      const nextMultiplier = getComboMultiplier(nextCombo, nextIsFever);
      const basePoints = count * 25 + (count > 1 ? count * count * 3 : 0);
      const chordBonus = isChord ? 120 : 0;
      const earnedPoints = Math.round((basePoints + chordBonus) * nextMultiplier);

      // Pulse Scanner limit & recovery:
      // - Using scanner consumes 1 charge immediately
      // - Normal reveals recover +1 charge every 5 combos (capped at scannerMaxCharges)
      const baseCharges = isScanner
        ? Math.max(0, prev.scannerCharges - 1)
        : prev.scannerCharges;
      const milestonesCrossed = !isScanner
        ? Math.max(
            0,
            Math.floor(nextCombo / COMBO_RECOVERY_STEP) -
              Math.floor(prevEffectiveCombo / COMBO_RECOVERY_STEP)
          )
        : 0;
      const nextCharges = Math.min(
        prev.scannerMaxCharges,
        baseCharges + milestonesCrossed
      );
      const recoveredScan = !isScanner && nextCharges > prev.scannerCharges;

      const updatedMetrics: DopamineMetrics = {
        score: prev.score + earnedPoints,
        combo: nextCombo,
        maxCombo: nextMaxCombo,
        comboTimerRatio: 1,
        multiplier: nextMultiplier,
        feverGauge: nextIsFever ? 100 : nextFeverGauge,
        isFever: nextIsFever,
        feverRemainingRatio: nextIsFever
          ? Math.min(1, (feverDeadlineRef.current - now) / FEVER_DURATION_MS)
          : 0,
        feverTriggers: nextFeverTriggers,
        scannerCharges: nextCharges,
        scannerMaxCharges: prev.scannerMaxCharges,
        scannerComboStep: nextCombo % COMBO_RECOVERY_STEP,
      };

      dopamineRef.current = updatedMetrics;
      setDopamine(updatedMetrics);
      setScoreBumpKey((k) => k + 1);

      // Classify exact Effect Tier (1..5)
      const maxAdjacentRevealed = result.revealedCells.reduce(
        (m, c) => Math.max(m, c.adjacentMines),
        0
      );
      const tier = resolveEffectTier({
        count,
        isChord,
        combo: nextCombo,
        isFever: nextIsFever,
        justTriggeredFever,
        maxAdjacentRevealed,
      });
      setLastTier(tier);

      const tierMeta = TIER_METADATA[tier];

      // Compute exact screen coordinates of every revealed tile from origin cell + grid pitch
      const cellScreenPoints: CellScreenPoint[] = result.revealedCells.map((c) => ({
        x: originX + (c.col - originCol) * cellStepPx,
        y: originY + (c.row - originRow) * cellStepPx,
        wave: c.wave,
        adjacentMines: c.adjacentMines,
      }));

      // Locate live Score HUD coordinates for homing score orbs
      let scoreTarget: { x: number; y: number } | undefined;
      if (scoreHudRef.current) {
        const rect = scoreHudRef.current.getBoundingClientRect();
        scoreTarget = {
          x: rect.left + rect.width * 0.5,
          y: rect.top + rect.height * 0.5,
        };
      }

      // Fire systematic multi-layer audio & visual impact
      soundEngine.playTierImpact(tier, count, nextCombo, nextIsFever);
      triggerShakeAndPunch(tierMeta.shake, tierMeta.punch, 130 + tier * 30);

      const sublabel = recoveredScan
        ? 'スキャン +1 回復!'
        : isChord
          ? `CHORD ×${count}`
          : count >= 6
            ? `WAVE ×${count}`
            : nextCombo >= 3
              ? `${nextCombo} COMBO`
              : undefined;

      vfxBus.emit({
        type: 'tile_impact',
        tier,
        x: originX,
        y: originY,
        cellSize: Math.max(24, cellStepPx - 3),
        cells: cellScreenPoints,
        scoreTarget,
        color: nextIsFever ? '#F59E0B' : tierMeta.color,
        isFever: nextIsFever,
        isChord,
        combo: nextCombo,
        pointsLabel: `+${earnedPoints.toLocaleString()}`,
        tierTitle: tierMeta.title,
        sublabel,
      });

      if (justTriggeredFever) {
        soundEngine.playFeverStart();
        vfxBus.emit({
          type: 'fever_banner',
          x: window.innerWidth * 0.5,
          y: Math.max(175, originY - 48),
        });
      }

      if (result.won) {
        setStatus('WON');
        soundEngine.playVictory();
        vfxBus.emit({ type: 'victory_fireworks' });
        finalizeRun(true, result.board, updatedMetrics);
      }
    },
    [finalizeRun, triggerShakeAndPunch]
  );

  const handleCellPrimaryAction = useCallback(
    (row: number, col: number, clientX: number, clientY: number, cellStepPx: number) => {
      if (statusRef.current === 'WON' || statusRef.current === 'LOST') return;

      let workingBoard = board;
      if (statusRef.current === 'IDLE') {
        workingBoard = populateMines(board, config.mines, row, col);
        startTimeRef.current = performance.now();
        setStatus('PLAYING');
      }

      const clickedCell = workingBoard[row][col];
      if (clickedCell.isRevealed) {
        if (clickedCell.adjacentMines > 0) {
          const chordResult = chordReveal(workingBoard, row, col);
          if (chordResult.revealedCells.length > 0 || chordResult.hitMine) {
            processRevealOutcome(
              chordResult,
              row,
              col,
              clientX,
              clientY,
              cellStepPx,
              true
            );
          }
        }
        return;
      }

      if (clickedCell.isFlagged) return;
      const result = revealCell(workingBoard, row, col);
      processRevealOutcome(result, row, col, clientX, clientY, cellStepPx, false);
    },
    [board, config.mines, processRevealOutcome]
  );

  const handleCellSecondaryAction = useCallback(
    (row: number, col: number, clientX: number, clientY: number) => {
      if (statusRef.current === 'WON' || statusRef.current === 'LOST') return;
      const { board: nextBoard, placed, changed } = toggleFlag(board, row, col);
      if (!changed) return;
      setBoard(nextBoard);
      soundEngine.playFlag(placed);
      vfxBus.emit({ type: 'flag_spark', x: clientX, y: clientY, placed });
    },
    [board]
  );

  const handleUsePulseScanner = useCallback(() => {
    if (statusRef.current !== 'PLAYING') return;
    if (dopamineRef.current.scannerCharges <= 0) return;

    const target = findSafeScanTarget(board);
    if (!target) return;

    setLastScannedCell(target);
    soundEngine.playScannerPulse();

    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.45;
    vfxBus.emit({
      type: 'shockwave',
      x: cx,
      y: cy,
      color: '#38BDF8',
      maxRadius: 160,
    });

    const result = revealCell(board, target.row, target.col);
    processRevealOutcome(result, target.row, target.col, cx, cy, 38, false, true);
  }, [board, processRevealOutcome]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'play') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setInputMode((m) => (m === 'dig' ? 'flag' : 'dig'));
      } else if (e.key === 'r' || e.key === 'R') {
        startNewGame(config);
      } else if (e.key === 's' || e.key === 'S') {
        handleUsePulseScanner();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, config, startNewGame, handleUsePulseScanner]);

  const flagsUsed = countFlags(board);
  const minesRemaining = config.mines - flagsUsed;
  const safeCellsTotal = config.rows * config.cols - config.mines;
  const safeCellsCleared = countRevealedSafe(board);
  const densityInfo = getDensityInfo(config.cols, config.rows, config.mines);

  const cycleFxIntensity = () => {
    setFxIntensity((prev) =>
      prev === 'full' ? 'standard' : prev === 'standard' ? 'minimal' : 'full'
    );
  };

  const fxLabel =
    fxIntensity === 'full' ? '演出: フル' : fxIntensity === 'standard' ? '演出: 標準' : '演出: 控えめ';

  const tierTextLabel =
    lastTier === 5
      ? 'T5 BIG BANG'
      : lastTier === 4
        ? 'T4 GALAXY'
        : lastTier === 3
          ? 'T3 NOVA'
          : lastTier === 2
            ? 'T2 PLASMA'
            : 'T1 SPARK';

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#070B14] text-slate-100">
      {/* Bespoke Deep Space Nebula Backdrop with Graceful Fallback */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 80%, rgba(245, 158, 11, 0.08), transparent 45%), radial-gradient(ellipse at 82% 20%, rgba(56, 189, 248, 0.09), transparent 48%), #070B14',
        }}
      >
        {backdropLoaded && (
          <img
            src={COSMIC_BACKDROP_URL}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBackdropLoaded(false)}
            className="h-full w-full object-cover opacity-75"
          />
        )}
        <div className="absolute inset-0 bg-[#070B14]/35" />
      </div>

      {/* Dual-Layer 60fps Starfield Warp & Systematic 5-Tier Foreground VFX Canvas */}
      <CosmicCanvas
        combo={dopamine.combo}
        isFever={dopamine.isFever}
        fxIntensity={fxIntensity}
        onOrbArrive={handleOrbArrive}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="relative z-20 border-b border-slate-800/80 bg-[#070B14]/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab('play')}
            className="font-display text-lg font-bold tracking-tight text-slate-50 transition-colors hover:text-amber-300 whitespace-nowrap shrink-0"
          >
            ASTRO SWEEP
          </button>

          <nav
            aria-label="メインナビゲーション"
            className="flex items-center gap-5 text-sm font-medium sm:gap-7"
          >
            <button
              type="button"
              onClick={() => setActiveTab('play')}
              className={`border-b-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'play'
                  ? 'border-amber-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              プレイ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className={`border-b-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'config'
                  ? 'border-amber-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              フィールド設定
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={`border-b-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'records'
                  ? 'border-amber-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              記録
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => startNewGame(config)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              新規ゲーム
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-61px)] max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-7">
        {activeTab === 'config' ? (
          <FieldConfigPanel
            currentConfig={config}
            onApplyAndStart={startNewGame}
            onCancel={() => setActiveTab('play')}
          />
        ) : activeTab === 'records' ? (
          <RecordsPanel
            records={records}
            onClearRecords={() => setRecords(clearRecords())}
            onBackToPlay={() => setActiveTab('play')}
          />
        ) : (
          <div className="mx-auto flex w-full flex-col items-center gap-4">
            {/* Arena HUD Strip */}
            <section
              aria-label="ゲームステータス"
              className="w-full max-w-4xl rounded-2xl border border-slate-800/90 bg-[#0F1626]/88 px-4 py-3.5 shadow-xl backdrop-blur-md sm:px-6"
            >
              <div className="grid grid-cols-2 items-center gap-4 md:grid-cols-12">
                {/* Mines & Timer */}
                <div className="flex items-center gap-5 md:col-span-4">
                  <div>
                    <p className="text-[11px] font-medium text-slate-400">残機雷</p>
                    <p
                      className={`font-mono-tabular text-xl font-bold ${
                        minesRemaining < 0 ? 'text-rose-400' : 'text-slate-50'
                      }`}
                    >
                      {minesRemaining}
                    </p>
                  </div>
                  <div className="h-7 w-px bg-slate-800" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-medium text-slate-400">タイム</p>
                    <p className="font-mono-tabular text-xl font-bold text-slate-100">
                      {formatTimer(elapsedSeconds)}
                    </p>
                  </div>
                </div>

                {/* Rolling Odometer Score (Target for Homing Orbs) */}
                <div className="flex flex-col items-end md:col-span-4 md:items-center">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-medium text-slate-400">スコア</span>
                    <span className="font-mono-tabular text-xs font-bold text-amber-300">
                      ×{dopamine.multiplier.toFixed(1)}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-sky-300">
                      {tierTextLabel}
                    </span>
                  </div>
                  <p
                    ref={scoreHudRef}
                    key={scoreBumpKey}
                    className={`animate-score-bump font-mono-tabular text-2xl font-bold tracking-tight ${
                      dopamine.isFever ? 'text-amber-300' : 'text-slate-50'
                    }`}
                  >
                    {displayScore.toLocaleString()}
                  </p>
                </div>

                {/* Overdrive Fever Gauge + Combo Decay */}
                <div className="col-span-2 md:col-span-4">
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`font-bold ${
                        dopamine.isFever ? 'text-amber-300' : 'text-slate-300'
                      }`}
                    >
                      {dopamine.isFever ? 'SUPERNOVA FEVER 発動中' : 'フィーバーゲージ'}
                    </span>
                    <span className="font-mono-tabular text-slate-400">
                      {dopamine.combo > 0
                        ? `${dopamine.combo} COMBO`
                        : `${Math.round(dopamine.feverGauge)}%`}
                    </span>
                  </div>

                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      style={{
                        transform: `scaleX(${
                          dopamine.isFever
                            ? dopamine.feverRemainingRatio
                            : dopamine.feverGauge / 100
                        })`,
                      }}
                      className={`h-full w-full origin-left transition-transform duration-100 ${
                        dopamine.isFever
                          ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500'
                          : 'bg-gradient-to-r from-sky-400 to-amber-400'
                      }`}
                    />
                  </div>

                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-900">
                    <div
                      style={{
                        transform: `scaleX(${dopamine.comboTimerRatio})`,
                      }}
                      className="h-full w-full origin-left bg-sky-400 transition-transform duration-75"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Primary Focal Anchor: The Cosmic Minesweeper Board */}
            <BoardView
              board={board}
              status={status}
              inputMode={inputMode}
              isFever={dopamine.isFever}
              shakeOffset={shakeOffset}
              boardPunchScale={boardPunchScale}
              lastScannedCell={lastScannedCell}
              dopamine={dopamine}
              elapsedSeconds={elapsedSeconds}
              minesRemaining={minesRemaining}
              safeCellsTotal={safeCellsTotal}
              safeCellsCleared={safeCellsCleared}
              onCellPrimaryAction={handleCellPrimaryAction}
              onCellSecondaryAction={handleCellSecondaryAction}
              onRestart={() => startNewGame(config)}
              onOpenConfig={() => setActiveTab('config')}
            />

            {/* Bottom Command & Quick-Adjust Toolbar */}
            <section
              aria-label="操作ツールバー"
              className="flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/85 bg-[#0F1626]/85 px-4 py-3 backdrop-blur-md"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <div
                  role="group"
                  aria-label="操作モード"
                  className="flex items-center rounded-lg border border-slate-800 bg-[#0A101D] p-1"
                >
                  <button
                    type="button"
                    onClick={() => setInputMode('dig')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      inputMode === 'dig'
                        ? 'bg-sky-400/20 text-sky-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    探索
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('flag')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      inputMode === 'flag'
                        ? 'bg-rose-400/20 text-rose-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    旗
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleUsePulseScanner}
                  disabled={status !== 'PLAYING' || dopamine.scannerCharges <= 0}
                  title={`安全なマスを1つ特定・開放（残 ${dopamine.scannerCharges}/${dopamine.scannerMaxCharges} · コンボ5ごとに+1回復 · Sキー）`}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    status === 'PLAYING' && dopamine.scannerCharges > 0
                      ? 'border-sky-400/60 bg-sky-400/15 text-sky-200 hover:bg-sky-400/25'
                      : 'border-slate-800 bg-slate-900/60 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Radar className="h-3.5 w-3.5" />
                  <span>安全スキャン</span>
                  <span className="font-mono-tabular text-amber-300">
                    {dopamine.scannerCharges}/{dopamine.scannerMaxCharges}
                  </span>
                  {dopamine.scannerCharges < dopamine.scannerMaxCharges && (
                    <span className="font-mono-tabular text-[10px] text-slate-400">
                      ({dopamine.scannerComboStep}/5)
                    </span>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {BOARD_PRESETS.map((preset) => {
                    const active = config.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          startNewGame({
                            presetId: preset.id,
                            cols: preset.cols,
                            rows: preset.rows,
                            mines: preset.mines,
                          })
                        }
                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-amber-400/20 text-amber-200'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                        }`}
                      >
                        {preset.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setActiveTab('config')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      config.presetId === 'custom'
                        ? 'bg-amber-400/20 text-amber-200'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    カスタム
                  </button>
                </div>

                <div className="hidden h-5 w-px bg-slate-800 sm:block" aria-hidden="true" />

                <button
                  type="button"
                  onClick={cycleFxIntensity}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0A101D] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100 whitespace-nowrap"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  {fxLabel}
                </button>

                <button
                  type="button"
                  aria-label={soundEnabled ? 'サウンドをミュート' : 'サウンドを有効化'}
                  onClick={() => setSoundEnabled((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-[#0A101D] text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100"
                >
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-sky-300" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-slate-500" />
                  )}
                </button>
              </div>
            </section>

            {/* Quiet Unboxed Metadata Line */}
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-slate-500 font-mono-tabular">
              <span>{getPresetDisplayName(config)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {config.cols}×{config.rows}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                地雷 {config.mines} ({densityInfo.percent.toFixed(1)}%)
              </span>
              <span aria-hidden="true">·</span>
              <span>Space: 探索/旗切替</span>
              <span aria-hidden="true">·</span>
              <span>S: 安全スキャン</span>
              <span aria-hidden="true">·</span>
              <span>R: リスタート</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
