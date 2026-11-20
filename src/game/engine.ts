import { BOARD_LIMITS, BOARD_PRESETS, BoardConfig, CellData, PresetId } from './types';

export function getMaxMines(cols: number, rows: number): number {
  const total = cols * rows;
  // Leave at least 1 safe cell, and cap at 65% density for playability
  return Math.max(1, Math.min(total - 1, Math.floor(total * BOARD_LIMITS.maxDensityRatio)));
}

export function clampBoardConfig(config: BoardConfig): BoardConfig {
  const cols = Math.max(BOARD_LIMITS.minCols, Math.min(BOARD_LIMITS.maxCols, Math.round(config.cols)));
  const rows = Math.max(BOARD_LIMITS.minRows, Math.min(BOARD_LIMITS.maxRows, Math.round(config.rows)));
  const maxMines = getMaxMines(cols, rows);
  const mines = Math.max(BOARD_LIMITS.minMines, Math.min(maxMines, Math.round(config.mines)));

  const matchedPreset = BOARD_PRESETS.find(
    (p) => p.cols === cols && p.rows === rows && p.mines === mines
  );
  const presetId: PresetId = matchedPreset ? matchedPreset.id : 'custom';

  return { presetId, cols, rows, mines };
}

export function getDensityInfo(cols: number, rows: number, mines: number): {
  percent: number;
  label: string;
} {
  const percent = Math.round((mines / (cols * rows)) * 1000) / 10;
  if (percent < 14) return { percent, label: '快適' };
  if (percent < 20) return { percent, label: '標準' };
  if (percent < 28) return { percent, label: '高難度' };
  return { percent, label: '極限' };
}

export function getInitialScannerCharges(cols: number, rows: number, mines: number): number {
  return Math.max(1, Math.floor(mines * ((cols * rows) / 100)));
}

export function createEmptyBoard(rows: number, cols: number): CellData[][] {
  const board: CellData[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowArr: CellData[] = [];
    for (let c = 0; c < cols; c++) {
      rowArr.push({
        row: r,
        col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        adjacentMines: 0,
        waveOrder: 0,
        detonated: false,
        wrongFlag: false,
      });
    }
    board.push(rowArr);
  }
  return board;
}

export function cloneBoard(board: CellData[][]): CellData[][] {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

export function getNeighbors(rows: number, cols: number, r: number, c: number): Array<[number, number]> {
  const res: Array<[number, number]> = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        res.push([nr, nc]);
      }
    }
  }
  return res;
}

/**
 * Generates mines after the player's first click so the opening is ALWAYS safe,
 * and guarantees a satisfying zero-cascade zone whenever the board has room.
 */
export function populateMines(
  board: CellData[][],
  mineCount: number,
  safeRow: number,
  safeCol: number
): CellData[][] {
  const rows = board.length;
  const cols = board[0].length;
  const next = cloneBoard(board);
  const totalCells = rows * cols;

  // Prefer keeping the full 3x3 zone around the first click mine-free
  const safeSet = new Set<string>();
  safeSet.add(`${safeRow},${safeCol}`);

  const neighbors = getNeighbors(rows, cols, safeRow, safeCol);
  if (totalCells - mineCount >= neighbors.length + 1) {
    for (const [nr, nc] of neighbors) {
      safeSet.add(`${nr},${nc}`);
    }
  }

  const candidates: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeSet.has(`${r},${c}`)) {
        candidates.push([r, c]);
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  const placed = Math.min(mineCount, candidates.length);
  for (let i = 0; i < placed; i++) {
    const [mr, mc] = candidates[i];
    next[mr][mc].isMine = true;
  }

  // Compute adjacent counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[r][c].isMine) continue;
      let count = 0;
      for (const [nr, nc] of getNeighbors(rows, cols, r, c)) {
        if (next[nr][nc].isMine) count++;
      }
      next[r][c].adjacentMines = count;
    }
  }

  return next;
}

export interface RevealResult {
  board: CellData[][];
  revealedCells: Array<{ row: number; col: number; wave: number; adjacentMines: number }>;
  hitMine: boolean;
  hitPosition?: { row: number; col: number };
  won: boolean;
}

export function revealCell(board: CellData[][], startRow: number, startCol: number): RevealResult {
  const rows = board.length;
  const cols = board[0].length;
  const next = cloneBoard(board);
  const startCell = next[startRow][startCol];

  if (startCell.isRevealed || startCell.isFlagged) {
    return { board: next, revealedCells: [], hitMine: false, won: false };
  }

  if (startCell.isMine) {
    startCell.isRevealed = true;
    startCell.detonated = true;
    revealAllMinesOnLoss(next);
    return {
      board: next,
      revealedCells: [],
      hitMine: true,
      hitPosition: { row: startRow, col: startCol },
      won: false,
    };
  }

  const revealedCells: Array<{ row: number; col: number; wave: number; adjacentMines: number }> = [];
  const queue: Array<{ r: number; c: number; wave: number }> = [{ r: startRow, c: startCol, wave: 0 }];
  const visited = new Set<string>([`${startRow},${startCol}`]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const cell = next[current.r][current.c];
    if (cell.isRevealed || cell.isFlagged || cell.isMine) continue;

    cell.isRevealed = true;
    cell.waveOrder = Math.min(current.wave, 14);
    revealedCells.push({
      row: current.r,
      col: current.c,
      wave: current.wave,
      adjacentMines: cell.adjacentMines,
    });

    if (cell.adjacentMines === 0) {
      for (const [nr, nc] of getNeighbors(rows, cols, current.r, current.c)) {
        const key = `${nr},${nc}`;
        if (!visited.has(key) && !next[nr][nc].isRevealed && !next[nr][nc].isFlagged) {
          visited.add(key);
          queue.push({ r: nr, c: nc, wave: current.wave + 1 });
        }
      }
    }
  }

  const won = checkVictory(next);
  if (won) {
    autoFlagMinesOnWin(next);
  }

  return { board: next, revealedCells, hitMine: false, won };
}

/**
 * Chord burst: When clicking a revealed numbered cell whose adjacent flags match its number,
 * open all remaining unflagged neighbors simultaneously.
 */
export function chordReveal(board: CellData[][], row: number, col: number): RevealResult {
  const rows = board.length;
  const cols = board[0].length;
  const target = board[row][col];

  if (!target.isRevealed || target.adjacentMines === 0) {
    return { board, revealedCells: [], hitMine: false, won: false };
  }

  const neighbors = getNeighbors(rows, cols, row, col);
  let flagCount = 0;
  const unrevealedTargets: Array<[number, number]> = [];

  for (const [nr, nc] of neighbors) {
    if (board[nr][nc].isFlagged) {
      flagCount++;
    } else if (!board[nr][nc].isRevealed) {
      unrevealedTargets.push([nr, nc]);
    }
  }

  if (flagCount !== target.adjacentMines || unrevealedTargets.length === 0) {
    return { board, revealedCells: [], hitMine: false, won: false };
  }

  let working = cloneBoard(board);
  const allRevealed: Array<{ row: number; col: number; wave: number; adjacentMines: number }> = [];

  for (const [nr, nc] of unrevealedTargets) {
    if (working[nr][nc].isRevealed || working[nr][nc].isFlagged) continue;
    const step = revealCell(working, nr, nc);
    working = step.board;
    if (step.hitMine) {
      return {
        board: working,
        revealedCells: allRevealed,
        hitMine: true,
        hitPosition: step.hitPosition,
        won: false,
      };
    }
    allRevealed.push(...step.revealedCells);
  }

  const won = checkVictory(working);
  if (won) {
    autoFlagMinesOnWin(working);
  }

  return {
    board: working,
    revealedCells: allRevealed,
    hitMine: false,
    won,
  };
}

export function toggleFlag(board: CellData[][], row: number, col: number): {
  board: CellData[][];
  placed: boolean;
  changed: boolean;
} {
  const cell = board[row][col];
  if (cell.isRevealed) {
    return { board, placed: false, changed: false };
  }
  const next = cloneBoard(board);
  next[row][col].isFlagged = !next[row][col].isFlagged;
  return {
    board: next,
    placed: next[row][col].isFlagged,
    changed: true,
  };
}

function revealAllMinesOnLoss(board: CellData[][]): void {
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine && !cell.isFlagged) {
        cell.isRevealed = true;
      } else if (!cell.isMine && cell.isFlagged) {
        cell.wrongFlag = true;
      }
    }
  }
}

function autoFlagMinesOnWin(board: CellData[][]): void {
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine) {
        cell.isFlagged = true;
      }
    }
  }
}

export function checkVictory(board: CellData[][]): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && !cell.isRevealed) {
        return false;
      }
    }
  }
  return true;
}

export function countFlags(board: CellData[][]): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isFlagged) count++;
    }
  }
  return count;
}

export function countRevealedSafe(board: CellData[][]): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isRevealed && !cell.isMine) count++;
    }
  }
  return count;
}

/**
 * Pulse Scanner skill: finds a helpful safe unrevealed cell (preferring frontier cells adjacent
 * to revealed numbers, or a zero cell for maximum chain joy!).
 */
export function findSafeScanTarget(board: CellData[][]): { row: number; col: number } | null {
  const rows = board.length;
  const cols = board[0].length;
  const frontierSafe: Array<{ row: number; col: number; isZero: boolean }> = [];
  const anySafe: Array<{ row: number; col: number; isZero: boolean }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.isMine || cell.isRevealed || cell.isFlagged) continue;
      const entry = { row: r, col: c, isZero: cell.adjacentMines === 0 };
      anySafe.push(entry);

      const touchesRevealed = getNeighbors(rows, cols, r, c).some(
        ([nr, nc]) => board[nr][nc].isRevealed
      );
      if (touchesRevealed) {
        frontierSafe.push(entry);
      }
    }
  }

  const pool = frontierSafe.length > 0 ? frontierSafe : anySafe;
  if (pool.length === 0) return null;

  const zeros = pool.filter((p) => p.isZero);
  const chosenPool = zeros.length > 0 ? zeros : pool;
  const pick = chosenPool[Math.floor(Math.random() * chosenPool.length)];
  return { row: pick.row, col: pick.col };
}

export function getComboMultiplier(combo: number, isFever: boolean): number {
  let base = 1;
  if (combo >= 25) base = 5;
  else if (combo >= 15) base = 4;
  else if (combo >= 8) base = 3;
  else if (combo >= 3) base = 2;
  else if (combo >= 1) base = 1.5;
  return isFever ? base * 2 : base;
}
