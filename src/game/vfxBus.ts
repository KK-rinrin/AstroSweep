export type EffectTier = 1 | 2 | 3 | 4 | 5;

export interface CellScreenPoint {
  x: number;
  y: number;
  wave: number;
  adjacentMines: number;
}

export type VfxEvent =
  | {
      type: 'tile_impact';
      tier: EffectTier;
      x: number;
      y: number;
      cellSize: number;
      cells: CellScreenPoint[];
      scoreTarget?: { x: number; y: number };
      color: string;
      isFever: boolean;
      isChord: boolean;
      combo: number;
      pointsLabel: string;
      tierTitle?: string;
      sublabel?: string;
    }
  | {
      type: 'shockwave';
      x: number;
      y: number;
      color: string;
      maxRadius: number;
    }
  | {
      type: 'flag_spark';
      x: number;
      y: number;
      placed: boolean;
    }
  | {
      type: 'fever_banner';
      x: number;
      y: number;
    }
  | {
      type: 'supernova';
      x: number;
      y: number;
      cellSize?: number;
      otherMines?: Array<{ x: number; y: number; dist: number }>;
    }
  | {
      type: 'victory_fireworks';
    }
  | {
      type: 'reset';
    };

type Listener = (event: VfxEvent) => void;

class VfxBus {
  private listeners = new Set<Listener>();

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public emit(event: VfxEvent): void {
    this.listeners.forEach((fn) => fn(event));
  }
}

export const vfxBus = new VfxBus();
