export type PresetId = 'lunar' | 'orbit' | 'deep_space' | 'custom';

export interface BoardConfig {
  presetId: PresetId;
  cols: number;
  rows: number;
  mines: number;
}

export interface PresetDefinition {
  id: Exclude<PresetId, 'custom'>;
  name: string;
  subtitle: string;
  cols: number;
  rows: number;
  mines: number;
}

export const BOARD_LIMITS = {
  minCols: 6,
  maxCols: 30,
  minRows: 6,
  maxRows: 24,
  minMines: 1,
  maxDensityRatio: 0.65,
} as const;

export const BOARD_PRESETS: PresetDefinition[] = [
  {
    id: 'lunar',
    name: '月面',
    subtitle: '初級 · テンポ重視',
    cols: 9,
    rows: 9,
    mines: 10,
  },
  {
    id: 'orbit',
    name: '衛星軌道',
    subtitle: '中級 · 標準バランス',
    cols: 16,
    rows: 16,
    mines: 40,
  },
  {
    id: 'deep_space',
    name: '深宇宙',
    subtitle: '上級 · 大連鎖向け',
    cols: 24,
    rows: 16,
    mines: 75,
  },
];

export type GameStatus = 'IDLE' | 'PLAYING' | 'WON' | 'LOST';

export type InputMode = 'dig' | 'flag';

export type FxIntensity = 'full' | 'standard' | 'minimal';

export type ActiveTab = 'play' | 'config' | 'records';

export interface CellData {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
  waveOrder: number;
  detonated: boolean;
  wrongFlag: boolean;
}

export interface RecordEntry {
  id: string;
  playedAt: string;
  presetLabel: string;
  cols: number;
  rows: number;
  mines: number;
  won: boolean;
  score: number;
  timeSeconds: number;
  maxCombo: number;
  feverTriggers: number;
}

export interface RecordsSummary {
  totalGames: number;
  totalWins: number;
  bestScore: number;
  bestCombo: number;
  totalCellsCleared: number;
  entries: RecordEntry[];
}

export interface DopamineMetrics {
  score: number;
  combo: number;
  maxCombo: number;
  comboTimerRatio: number; // 0 to 1
  multiplier: number;
  feverGauge: number; // 0 to 100
  isFever: boolean;
  feverRemainingRatio: number; // 0 to 1
  feverTriggers: number;
  scannerCharges: number;
  scannerMaxCharges: number;
  scannerComboStep: number; // 0 to 4 progress toward next +1 recovery at 5 combo
}
