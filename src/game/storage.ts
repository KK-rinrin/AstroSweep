import { BOARD_PRESETS, BoardConfig, RecordEntry, RecordsSummary } from './types';
import { clampBoardConfig } from './engine';

const RECORDS_KEY = 'astro_sweep_records_v1';
const CONFIG_KEY = 'astro_sweep_config_v1';

const DEFAULT_RECORDS: RecordsSummary = {
  totalGames: 0,
  totalWins: 0,
  bestScore: 0,
  bestCombo: 0,
  totalCellsCleared: 0,
  entries: [],
};

export function loadRecords(): RecordsSummary {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return DEFAULT_RECORDS;
    const parsed = JSON.parse(raw) as Partial<RecordsSummary>;
    return {
      totalGames: typeof parsed.totalGames === 'number' ? parsed.totalGames : 0,
      totalWins: typeof parsed.totalWins === 'number' ? parsed.totalWins : 0,
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      totalCellsCleared: typeof parsed.totalCellsCleared === 'number' ? parsed.totalCellsCleared : 0,
      entries: Array.isArray(parsed.entries) ? parsed.entries.slice(0, 30) : [],
    };
  } catch {
    return DEFAULT_RECORDS;
  }
}

export function saveGameRecord(
  current: RecordsSummary,
  entry: RecordEntry,
  cellsCleared: number
): RecordsSummary {
  const next: RecordsSummary = {
    totalGames: current.totalGames + 1,
    totalWins: current.totalWins + (entry.won ? 1 : 0),
    bestScore: Math.max(current.bestScore, entry.score),
    bestCombo: Math.max(current.bestCombo, entry.maxCombo),
    totalCellsCleared: current.totalCellsCleared + cellsCleared,
    entries: [entry, ...current.entries].slice(0, 30),
  };
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function clearRecords(): RecordsSummary {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // Ignore
  }
  return DEFAULT_RECORDS;
}

export function loadSavedConfig(): BoardConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      const def = BOARD_PRESETS[0];
      return { presetId: def.id, cols: def.cols, rows: def.rows, mines: def.mines };
    }
    const parsed = JSON.parse(raw) as BoardConfig;
    return clampBoardConfig(parsed);
  } catch {
    const def = BOARD_PRESETS[0];
    return { presetId: def.id, cols: def.cols, rows: def.rows, mines: def.mines };
  }
}

export function saveConfig(config: BoardConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore
  }
}
