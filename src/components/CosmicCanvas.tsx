import { useEffect, useRef } from 'react';
import { FxIntensity } from '../game/types';
import { EffectTier, VfxEvent, vfxBus } from '../game/vfxBus';
import { soundEngine } from '../game/soundEngine';

interface CosmicCanvasProps {
  combo: number;
  isFever: boolean;
  fxIntensity: FxIntensity;
  onOrbArrive?: () => void;
}

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
  size: number;
  hue: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
  shape: 'circle' | 'diamond' | 'spark' | 'streak';
}

interface TileShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  fill: string;
  edge: string;
  life: number;
  maxLife: number;
}

interface StarFlare {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  points: number;
  rot: number;
  vrot: number;
  color: string;
  life: number;
  maxLife: number;
}

interface LightSlash {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  color: string;
  life: number;
  maxLife: number;
}

interface LightningArc {
  points: Array<{ x: number; y: number }>;
  color: string;
  life: number;
  maxLife: number;
  width: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

interface HomingOrb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  color: string;
  trail: Array<{ x: number; y: number }>;
  age: number;
  pitchStep: number;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  tierTitle?: string;
  sublabel?: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

interface FireballPlume {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  coreColor: string;
  midColor: string;
  outerColor: string;
}

interface DelayedTask {
  framesLeft: number;
  run: () => void;
}

function buildJaggedArc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  segments = 5,
  jitter = 14
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const offset = (Math.random() * 2 - 1) * jitter;
    pts.push({
      x: x1 + dx * t + nx * offset,
      y: y1 + dy * t + ny * offset,
    });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

export function CosmicCanvas({
  combo,
  isFever,
  fxIntensity,
  onOrbArrive,
}: CosmicCanvasProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const stateRef = useRef({ combo, isFever, fxIntensity, onOrbArrive });
  stateRef.current = { combo, isFever, fxIntensity, onOrbArrive };

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!bgCanvas || !fxCanvas) return;

    const bgCtx = bgCanvas.getContext('2d');
    const fxCtx = fxCanvas.getContext('2d');
    if (!bgCtx || !fxCtx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      bgCanvas.width = Math.floor(width * dpr);
      bgCanvas.height = Math.floor(height * dpr);
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      fxCanvas.width = Math.floor(width * dpr);
      fxCanvas.height = Math.floor(height * dpr);
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    // Initialize radial 3D starfield
    const STAR_COUNT = 145;
    const starPalette = ['#F8FAFC', '#BAE6FD', '#FDE68A', '#CBD5E1'];
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => {
      const z = Math.random() * width + 1;
      return {
        x: (Math.random() - 0.5) * width * 1.4,
        y: (Math.random() - 0.5) * height * 1.4,
        z,
        pz: z,
        size: 0.7 + Math.random() * 1.4,
        hue: starPalette[Math.floor(Math.random() * starPalette.length)],
      };
    });

    const particles: Particle[] = [];
    const shards: TileShard[] = [];
    const flares: StarFlare[] = [];
    const slashes: LightSlash[] = [];
    const arcs: LightningArc[] = [];
    const shockwaves: Shockwave[] = [];
    const fireballs: FireballPlume[] = [];
    const orbs: HomingOrb[] = [];
    const floatingTexts: FloatingText[] = [];
    const delayedTasks: DelayedTask[] = [];

    let screenFlashAlpha = 0;
    let screenFlashColor = '#38BDF8';
    let edgePulseAlpha = 0;
    let edgePulseColor = '#F59E0B';
    let currentSpeed = 0.8;

    const getIntensityScale = (): number => {
      if (prefersReducedMotion) return 0.25;
      const mode = stateRef.current.fxIntensity;
      if (mode === 'minimal') return 0.28;
      if (mode === 'standard') return 0.68;
      return 1;
    };

    const spawnParticles = (
      x: number,
      y: number,
      count: number,
      colors: string[],
      speedMin: number,
      speedMax: number,
      lifeMin: number,
      lifeMax: number,
      gravity = 0.04,
      shapes: Array<Particle['shape']> = ['circle', 'diamond', 'spark', 'streak']
    ) => {
      const mult = getIntensityScale();
      const actualCount = Math.max(2, Math.round(count * mult));
      for (let i = 0; i < actualCount; i++) {
        const angle = (Math.PI * 2 * i) / actualCount + (Math.random() - 0.5) * 0.55;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        const maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2.2 + Math.random() * 3.8,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: maxLife,
          maxLife,
          drag: 0.935,
          gravity,
          shape: shapes[Math.floor(Math.random() * shapes.length)],
        });
      }
    };

    const spawnTileShatter = (
      x: number,
      y: number,
      cellSize: number,
      edgeColor: string,
      power = 1
    ) => {
      const mult = getIntensityScale();
      if (mult < 0.35) return;
      const half = Math.max(8, cellSize * 0.42);
      const offsets = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      for (const [ox, oy] of offsets) {
        const speed = (2.2 + Math.random() * 2.8) * power;
        const angle = Math.atan2(oy, ox) + (Math.random() - 0.5) * 0.65;
        shards.push({
          x: x + ox * (half * 0.42),
          y: y + oy * (half * 0.42),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.9,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.38,
          size: half * (0.65 + Math.random() * 0.35),
          fill: '#1E2B47',
          edge: edgeColor,
          life: 24 + Math.random() * 12,
          maxLife: 36,
        });
      }
    };

    const spawnTileImpact = (ev: Extract<VfxEvent, { type: 'tile_impact' }>) => {
      const tier: EffectTier = ev.tier;
      const mult = getIntensityScale();
      const basePalette = ev.isFever
        ? ['#F59E0B', '#FEF08A', '#38BDF8', '#FFFFFF']
        : tier >= 4
          ? ['#F59E0B', '#38BDF8', '#34D399', '#F472B6', '#FFFFFF']
          : tier === 3
            ? ['#38BDF8', '#34D399', '#FDE047', '#FFFFFF']
            : [ev.color, '#BAE6FD', '#FFFFFF'];

      // === TIER 1 (ALL OPENINGS): Tile Shatter + Star Flare + Core Sparks + Ring ===
      spawnTileShatter(ev.x, ev.y, ev.cellSize, ev.isFever ? '#FDE047' : ev.color, 0.9 + tier * 0.22);

      flares.push({
        x: ev.x,
        y: ev.y,
        radius: ev.cellSize * 0.4,
        maxRadius: ev.cellSize * (1.45 + tier * 0.55),
        points: tier >= 3 ? 8 : 4,
        rot: Math.random() * 0.4,
        vrot: tier >= 3 ? 0.08 : 0.03,
        color: ev.isFever ? '#FEF08A' : ev.color,
        life: 14 + tier * 4,
        maxLife: 14 + tier * 4,
      });

      shockwaves.push({
        x: ev.x,
        y: ev.y,
        radius: ev.cellSize * 0.3,
        maxRadius: Math.min(260, 48 + tier * 36 + ev.cells.length * 2.5),
        color: ev.isFever ? '#F59E0B' : ev.color,
        alpha: 0.92,
        lineWidth: 2 + tier * 0.55,
      });

      spawnParticles(
        ev.x,
        ev.y,
        10 + tier * 8,
        basePalette,
        2.4,
        5.5 + tier * 1.4,
        20,
        36 + tier * 6,
        0.035
      );

      // === TIER 2+: Double Shockwave + Plasma Lightning Arcs + Homing Orbs ===
      if (tier >= 2 && mult > 0.3) {
        delayedTasks.push({
          framesLeft: 3,
          run: () => {
            shockwaves.push({
              x: ev.x,
              y: ev.y,
              radius: ev.cellSize * 0.2,
              maxRadius: Math.min(310, 82 + tier * 44),
              color: '#FFFFFF',
              alpha: 0.75,
              lineWidth: 1.8,
            });
          },
        });

        // Homing Score Orbs flying straight into the Score HUD
        if (ev.scoreTarget) {
          const orbCount = Math.min(9, Math.max(2, tier + Math.floor(ev.cells.length / 4)));
          for (let i = 0; i < orbCount; i++) {
            const src = ev.cells[Math.min(ev.cells.length - 1, Math.floor((i / orbCount) * ev.cells.length))] ?? {
              x: ev.x,
              y: ev.y,
            };
            const angle = Math.random() * Math.PI * 2;
            const burstSpeed = 3.2 + Math.random() * 3.8;
            orbs.push({
              x: src.x,
              y: src.y,
              vx: Math.cos(angle) * burstSpeed,
              vy: Math.sin(angle) * burstSpeed - 1.5,
              tx: ev.scoreTarget.x,
              ty: ev.scoreTarget.y,
              color: ev.isFever || tier >= 4 ? '#FDE047' : '#38BDF8',
              trail: [],
              age: 0,
              pitchStep: i,
            });
          }
        }
      }

      // === PER-CELL WAVEFRONT CASCADE EFFECTS (Tier 2+ multi-cell openings) ===
      if (ev.cells.length > 1 && mult > 0.3) {
        const sampledCells = ev.cells.slice(1, 22);
        sampledCells.forEach((cell, idx) => {
          const delayFrames = Math.min(18, Math.max(1, Math.round(cell.wave * 1.4)));
          delayedTasks.push({
            framesLeft: delayFrames,
            run: () => {
              // Individual tile micro-shatter & sparkle
              if (idx < 10) {
                spawnTileShatter(cell.x, cell.y, ev.cellSize * 0.85, ev.color, 0.85);
              }
              spawnParticles(
                cell.x,
                cell.y,
                tier >= 3 ? 6 : 4,
                basePalette,
                1.4,
                3.8,
                14,
                26,
                0.02,
                ['diamond', 'spark']
              );

              // Chain Lightning Plasma Arcs linking origin or previous cell
              if (idx < 8) {
                const prevPt = idx === 0 ? { x: ev.x, y: ev.y } : sampledCells[idx - 1];
                arcs.push({
                  points: buildJaggedArc(prevPt.x, prevPt.y, cell.x, cell.y, 5, 11),
                  color: ev.isFever ? '#FEF08A' : '#7DD3FC',
                  life: 9,
                  maxLife: 9,
                  width: tier >= 3 ? 2.2 : 1.5,
                });
              }
            },
          });
        });
      }

      // === TIER 3+: Radiant Edge Pulse + Secondary Starbursts ===
      if (tier >= 3 && mult > 0.35) {
        edgePulseAlpha = Math.min(0.45, 0.2 + tier * 0.06);
        edgePulseColor = ev.isFever ? '#F59E0B' : ev.isChord ? '#34D399' : '#38BDF8';
      }

      // === TIER 4+: Full Orbital Cosmic Light Slashes + Screen Flash ===
      if (tier >= 4 && mult > 0.4) {
        screenFlashAlpha = tier >= 5 ? 0.17 : 0.11;
        screenFlashColor = ev.isFever ? '#FEF08A' : '#7DD3FC';

        // Cardinal Horizontal & Vertical Slashes
        slashes.push({
          x: ev.x,
          y: ev.y,
          angle: 0,
          length: Math.max(width, height) * 1.15,
          width: tier >= 5 ? 16 : 11,
          color: ev.isFever ? '#FDE047' : '#38BDF8',
          life: 16,
          maxLife: 16,
        });
        slashes.push({
          x: ev.x,
          y: ev.y,
          angle: Math.PI / 2,
          length: Math.max(width, height) * 1.15,
          width: tier >= 5 ? 14 : 9,
          color: '#FFFFFF',
          life: 14,
          maxLife: 14,
        });

        // Tier 5: Twin Diagonal Big-Bang Cross Slashes + Prismatic 3rd Shockwave
        if (tier >= 5) {
          slashes.push({
            x: ev.x,
            y: ev.y,
            angle: Math.PI / 4,
            length: Math.max(width, height) * 1.25,
            width: 12,
            color: '#F59E0B',
            life: 20,
            maxLife: 20,
          });
          slashes.push({
            x: ev.x,
            y: ev.y,
            angle: -Math.PI / 4,
            length: Math.max(width, height) * 1.25,
            width: 12,
            color: '#F472B6',
            life: 20,
            maxLife: 20,
          });
          delayedTasks.push({
            framesLeft: 6,
            run: () => {
              shockwaves.push({
                x: ev.x,
                y: ev.y,
                radius: 24,
                maxRadius: Math.min(width, height) * 0.52,
                color: '#FDE047',
                alpha: 0.9,
                lineWidth: 4,
              });
            },
          });
        }
      }

      // === KINETIC FLOATING CALLOUT ===
      floatingTexts.push({
        x: ev.x,
        y: ev.y - 12,
        vy: tier >= 3 ? -1.9 : -1.55,
        text: ev.pointsLabel,
        tierTitle: ev.tierTitle,
        sublabel: ev.sublabel,
        color: ev.isFever || tier >= 4 ? '#FDE047' : ev.color,
        life: 48 + tier * 6,
        maxLife: 48 + tier * 6,
        scale: Math.min(1.55, 0.98 + tier * 0.12),
      });
    };

    const handleEvent = (ev: VfxEvent) => {
      if (ev.type === 'reset') {
        delayedTasks.length = 0;
        fireballs.length = 0;
        slashes.length = 0;
        arcs.length = 0;
        shockwaves.length = 0;
        flares.length = 0;
        floatingTexts.length = 0;
        screenFlashAlpha = 0;
        edgePulseAlpha = 0;
        return;
      }
      if (ev.type === 'tile_impact') {
        spawnTileImpact(ev);
      } else if (ev.type === 'shockwave') {
        if (getIntensityScale() > 0.3) {
          shockwaves.push({
            x: ev.x,
            y: ev.y,
            radius: 10,
            maxRadius: ev.maxRadius,
            color: ev.color,
            alpha: 0.85,
            lineWidth: 2.5,
          });
        }
      } else if (ev.type === 'flag_spark') {
        spawnParticles(
          ev.x,
          ev.y,
          ev.placed ? 14 : 6,
          ev.placed ? ['#F43F5E', '#FDA4AF', '#FDE68A'] : ['#94A3B8', '#E2E8F0'],
          1.6,
          4.2,
          16,
          28,
          0.02
        );
        if (ev.placed) {
          flares.push({
            x: ev.x,
            y: ev.y,
            radius: 6,
            maxRadius: 30,
            points: 4,
            rot: Math.PI / 4,
            vrot: 0.06,
            color: '#FB7185',
            life: 12,
            maxLife: 12,
          });
        }
      } else if (ev.type === 'fever_banner') {
        screenFlashAlpha = 0.16;
        screenFlashColor = '#FDE047';
        edgePulseAlpha = 0.48;
        edgePulseColor = '#F59E0B';
        shockwaves.push({
          x: ev.x,
          y: ev.y,
          radius: 20,
          maxRadius: Math.min(width, height) * 0.7,
          color: '#F59E0B',
          alpha: 0.95,
          lineWidth: 4,
        });
        slashes.push({
          x: ev.x,
          y: ev.y,
          angle: 0,
          length: width * 1.2,
          width: 18,
          color: '#FDE047',
          life: 22,
          maxLife: 22,
        });
        spawnParticles(
          ev.x,
          ev.y,
          48,
          ['#F59E0B', '#FDE047', '#38BDF8', '#FFFFFF'],
          4,
          12,
          38,
          68,
          0.02
        );
        floatingTexts.push({
          x: ev.x,
          y: ev.y - 16,
          vy: -1.1,
          text: 'SUPERNOVA FEVER ×2',
          tierTitle: 'TIER 5 · OVERDRIVE',
          sublabel: '全エフェクト＆倍率倍増',
          color: '#FDE047',
          life: 78,
          maxLife: 78,
          scale: 1.5,
        });
      } else if (ev.type === 'supernova') {
        const mult = getIntensityScale();
        const blastCell = ev.cellSize ?? 38;
        const maxDim = Math.max(width, height);

        // === PHASE 0: Blinding Ignition Flash & 4-Axis Hyper-Nova Light Slashes ===
        screenFlashAlpha = mult > 0.35 ? 0.36 : 0.16;
        screenFlashColor = '#FFF7ED';
        edgePulseAlpha = 0.85;
        edgePulseColor = '#F43F5E';

        if (mult > 0.35) {
          const slashSpecs = [
            { angle: 0, width: 32, color: '#F43F5E', life: 28 },
            { angle: Math.PI / 2, width: 28, color: '#F97316', life: 26 },
            { angle: Math.PI / 4, width: 22, color: '#FDE047', life: 24 },
            { angle: -Math.PI / 4, width: 22, color: '#FB7185', life: 24 },
          ];
          slashSpecs.forEach((s) => {
            slashes.push({
              x: ev.x,
              y: ev.y,
              angle: s.angle,
              length: maxDim * 1.45,
              width: s.width,
              color: s.color,
              life: s.life,
              maxLife: s.life,
            });
          });
        }

        // === PHASE 1: Massive 12-Point Blinding Starburst & 5 Staggered Shockwaves ===
        flares.push({
          x: ev.x,
          y: ev.y,
          radius: 18,
          maxRadius: Math.min(340, maxDim * 0.28),
          points: 12,
          rot: 0,
          vrot: 0.045,
          color: '#FEF08A',
          life: 36,
          maxLife: 36,
        });
        flares.push({
          x: ev.x,
          y: ev.y,
          radius: 12,
          maxRadius: Math.min(240, maxDim * 0.2),
          points: 8,
          rot: Math.PI / 8,
          vrot: -0.06,
          color: '#F43F5E',
          life: 32,
          maxLife: 32,
        });

        const ringSpecs = [
          { delay: 0, maxR: Math.min(680, maxDim * 0.56), color: '#FFFFFF', lw: 7 },
          { delay: 3, maxR: Math.min(580, maxDim * 0.48), color: '#FDE047', lw: 6 },
          { delay: 6, maxR: Math.min(490, maxDim * 0.42), color: '#F97316', lw: 5.5 },
          { delay: 10, maxR: Math.min(410, maxDim * 0.36), color: '#F43F5E', lw: 4.5 },
          { delay: 15, maxR: Math.min(760, maxDim * 0.65), color: '#E11D48', lw: 3.5 },
        ];
        ringSpecs.forEach((r) => {
          const pushRing = () => {
            shockwaves.push({
              x: ev.x,
              y: ev.y,
              radius: 10,
              maxRadius: r.maxR,
              color: r.color,
              alpha: 0.96,
              lineWidth: r.lw,
            });
          };
          if (r.delay === 0) pushRing();
          else delayedTasks.push({ framesLeft: r.delay, run: pushRing });
        });

        // Volumetric Expanding Fireball Plumes (18 layered plasma clouds)
        const plumeCount = Math.max(5, Math.round(18 * mult));
        for (let i = 0; i < plumeCount; i++) {
          const ang = (Math.PI * 2 * i) / plumeCount + (Math.random() - 0.5) * 0.5;
          const speed = i < 3 ? 0.5 + Math.random() * 1.2 : 1.8 + Math.random() * 5.2;
          const maxLife = 36 + Math.random() * 28;
          fireballs.push({
            x: ev.x + Math.cos(ang) * (Math.random() * 14),
            y: ev.y + Math.sin(ang) * (Math.random() * 14),
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            radius: 14 + Math.random() * 16,
            maxRadius: (i < 3 ? 115 : 58) + Math.random() * 54,
            life: maxLife,
            maxLife,
            coreColor: '#FFFFFF',
            midColor: i % 2 === 0 ? '#FDE047' : '#F97316',
            outerColor: '#E11D48',
          });
        }

        // Radial EMP Plasma Lightning ripping outward from the epicenter
        if (mult > 0.35) {
          const empCount = 10;
          for (let i = 0; i < empCount; i++) {
            const ang = (Math.PI * 2 * i) / empCount + (Math.random() - 0.5) * 0.35;
            const dist = 120 + Math.random() * 210;
            arcs.push({
              points: buildJaggedArc(
                ev.x,
                ev.y,
                ev.x + Math.cos(ang) * dist,
                ev.y + Math.sin(ang) * dist,
                7,
                22
              ),
              color: i % 2 === 0 ? '#FDE047' : '#FB7185',
              life: 16 + Math.floor(Math.random() * 10),
              maxLife: 26,
              width: 3.2,
            });
          }
        }

        // Heavy Hull Shatter Shards + 140+ Molten Sparks & High-Velocity Streaks
        for (let k = 0; k < 4; k++) {
          spawnTileShatter(ev.x, ev.y, blastCell * (1.2 + k * 0.2), '#FB7185', 2.4 + k * 0.5);
        }

        // Fast fiery jet streaks
        spawnParticles(
          ev.x,
          ev.y,
          75,
          ['#FFFFFF', '#FEF08A', '#F59E0B', '#F97316', '#F43F5E'],
          5.5,
          19,
          28,
          62,
          0.04,
          ['streak', 'spark']
        );
        // Glowing heavy embers with gravity
        spawnParticles(
          ev.x,
          ev.y,
          65,
          ['#F43F5E', '#FB7185', '#F97316', '#FDE047'],
          2.2,
          12.5,
          48,
          96,
          0.11,
          ['diamond', 'circle']
        );

        // Kinetic Supernova Banner Callout
        floatingTexts.push({
          x: ev.x,
          y: Math.max(120, ev.y - 26),
          vy: -0.9,
          text: 'SUPERNOVA IMPACT',
          tierTitle: 'CRITICAL BREACH',
          sublabel: '全機雷誘爆',
          color: '#FEF08A',
          life: 62,
          maxLife: 62,
          scale: 1.55,
        });

        // === PHASE 2 (0.3s – 1.8s): Rolling Radial Chain-Detonation of ALL Other Mines! ===
        if (ev.otherMines && ev.otherMines.length > 0 && mult > 0.3) {
          const sorted = [...ev.otherMines].sort((a, b) => a.dist - b.dist);
          const maxDist = Math.max(1, sorted[sorted.length - 1].dist);
          const capped = sorted.slice(0, 40);

          capped.forEach((mine, idx) => {
            // Spread across frames 18..108 (~0.30s to ~1.80s)
            const delayFrames = Math.max(
              18,
              Math.min(108, Math.round(18 + (mine.dist / maxDist) * 86 + (idx % 3) * 2))
            );
            delayedTasks.push({
              framesLeft: delayFrames,
              run: () => {
                edgePulseAlpha = Math.max(edgePulseAlpha, 0.32);
                edgePulseColor = '#F97316';

                fireballs.push({
                  x: mine.x,
                  y: mine.y,
                  vx: (Math.random() - 0.5) * 1.6,
                  vy: (Math.random() - 0.5) * 1.6,
                  radius: 10,
                  maxRadius: 52 + Math.random() * 28,
                  life: 32,
                  maxLife: 32,
                  coreColor: '#FFFFFF',
                  midColor: idx % 2 === 0 ? '#FDE047' : '#F97316',
                  outerColor: '#E11D48',
                });
                shockwaves.push({
                  x: mine.x,
                  y: mine.y,
                  radius: 6,
                  maxRadius: 88 + Math.random() * 44,
                  color: idx % 2 === 0 ? '#F97316' : '#F43F5E',
                  alpha: 0.92,
                  lineWidth: 3,
                });
                flares.push({
                  x: mine.x,
                  y: mine.y,
                  radius: 8,
                  maxRadius: 62,
                  points: 6,
                  rot: Math.random() * Math.PI,
                  vrot: 0.08,
                  color: '#FDE047',
                  life: 20,
                  maxLife: 20,
                });
                spawnTileShatter(mine.x, mine.y, blastCell * 0.95, '#F97316', 1.6);
                spawnParticles(
                  mine.x,
                  mine.y,
                  18,
                  ['#FFFFFF', '#FDE047', '#F97316', '#F43F5E'],
                  2.8,
                  10,
                  24,
                  52,
                  0.07,
                  ['streak', 'spark', 'diamond']
                );

                // EMP plasma arc linking consecutive detonating mines
                const prevMine = idx === 0 ? { x: ev.x, y: ev.y } : capped[idx - 1];
                if (idx < 18) {
                  arcs.push({
                    points: buildJaggedArc(prevMine.x, prevMine.y, mine.x, mine.y, 6, 16),
                    color: idx % 2 === 0 ? '#FDE047' : '#FB7185',
                    life: 12,
                    maxLife: 12,
                    width: 2.5,
                  });
                }

                // Staggered realistic secondary boom audio
                if (idx < 12 || idx % 3 === 0) {
                  soundEngine.playSecondaryDetonation(0.7 - (idx / capped.length) * 0.25);
                }
              },
            });
          });
        }

        // === PHASE 3 (1.92s / Frame 115): GRAND FINALE SUPERNOVA COLLAPSE & MEGA BLAST ===
        delayedTasks.push({
          framesLeft: 115,
          run: () => {
            soundEngine.playFinaleSupernova();
            screenFlashAlpha = mult > 0.35 ? 0.42 : 0.18;
            screenFlashColor = '#FEF08A';
            edgePulseAlpha = 0.95;
            edgePulseColor = '#F43F5E';

            // 6-Axis Screen-Spanning Prismatic Light Slashes
            if (mult > 0.35) {
              const finaleAngles = [
                0,
                Math.PI / 6,
                Math.PI / 3,
                Math.PI / 2,
                (2 * Math.PI) / 3,
                (5 * Math.PI) / 6,
              ];
              const finaleColors = ['#FFFFFF', '#FDE047', '#F97316', '#F43F5E', '#FB7185', '#FDE047'];
              finaleAngles.forEach((ang, i) => {
                slashes.push({
                  x: ev.x,
                  y: ev.y,
                  angle: ang,
                  length: maxDim * 1.6,
                  width: i % 2 === 0 ? 36 : 24,
                  color: finaleColors[i],
                  life: 34,
                  maxLife: 34,
                });
              });
            }

            // Blinding 16-Point Supernova Starburst
            flares.push({
              x: ev.x,
              y: ev.y,
              radius: 26,
              maxRadius: Math.min(460, maxDim * 0.38),
              points: 16,
              rot: 0,
              vrot: 0.035,
              color: '#FEF08A',
              life: 48,
              maxLife: 48,
            });
            flares.push({
              x: ev.x,
              y: ev.y,
              radius: 16,
              maxRadius: Math.min(340, maxDim * 0.28),
              points: 10,
              rot: Math.PI / 10,
              vrot: -0.05,
              color: '#F43F5E',
              life: 44,
              maxLife: 44,
            });

            // 3 Colossal Full-Screen Shockwave Fronts
            const finaleRings = [
              { delay: 0, maxR: maxDim * 0.88, color: '#FFFFFF', lw: 9 },
              { delay: 5, maxR: maxDim * 0.82, color: '#FDE047', lw: 7.5 },
              { delay: 11, maxR: maxDim * 0.95, color: '#F43F5E', lw: 6 },
            ];
            finaleRings.forEach((r) => {
              const emitRing = () => {
                shockwaves.push({
                  x: ev.x,
                  y: ev.y,
                  radius: 16,
                  maxRadius: r.maxR,
                  color: r.color,
                  alpha: 0.98,
                  lineWidth: r.lw,
                });
              };
              if (r.delay === 0) emitRing();
              else delayedTasks.push({ framesLeft: r.delay, run: emitRing });
            });

            // 24 Expanding Volumetric Supernova Fireball Plumes
            const finalePlumes = Math.max(6, Math.round(24 * mult));
            for (let i = 0; i < finalePlumes; i++) {
              const ang = (Math.PI * 2 * i) / finalePlumes + (Math.random() - 0.5) * 0.45;
              const speed = i < 4 ? 0.6 + Math.random() * 1.4 : 2.6 + Math.random() * 7.2;
              const maxLife = 46 + Math.random() * 34;
              fireballs.push({
                x: ev.x + Math.cos(ang) * (Math.random() * 18),
                y: ev.y + Math.sin(ang) * (Math.random() * 18),
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                radius: 20 + Math.random() * 22,
                maxRadius: (i < 4 ? 165 : 85) + Math.random() * 70,
                life: maxLife,
                maxLife,
                coreColor: '#FFFFFF',
                midColor: i % 2 === 0 ? '#FEF08A' : '#F97316',
                outerColor: '#E11D48',
              });
            }

            // 160 Fiery Meteors & Drifting Ember Storm lasting through Act 4 (3.0s+)
            spawnParticles(
              ev.x,
              ev.y,
              90,
              ['#FFFFFF', '#FEF08A', '#F59E0B', '#F97316', '#F43F5E'],
              6.5,
              24,
              36,
              76,
              0.04,
              ['streak', 'spark']
            );
            spawnParticles(
              ev.x,
              ev.y,
              70,
              ['#F43F5E', '#FB7185', '#F97316', '#FDE047'],
              1.8,
              11,
              64,
              120,
              0.06,
              ['diamond', 'circle']
            );

            // Grand Finale Callout
            floatingTexts.push({
              x: width * 0.5,
              y: Math.max(150, height * 0.36),
              vy: -0.65,
              text: 'TOTAL ANNIHILATION',
              tierTitle: 'SUPERNOVA COMPLETE',
              sublabel: '宙域崩壊',
              color: '#FEF08A',
              life: 68,
              maxLife: 68,
              scale: 1.65,
            });
          },
        });
      } else if (ev.type === 'victory_fireworks') {
        const bursts = prefersReducedMotion ? 2 : 6;
        for (let b = 0; b < bursts; b++) {
          const bx = width * (0.18 + Math.random() * 0.64);
          const by = height * (0.16 + Math.random() * 0.44);
          delayedTasks.push({
            framesLeft: b * 12,
            run: () => {
              shockwaves.push({
                x: bx,
                y: by,
                radius: 10,
                maxRadius: 175,
                color: b % 2 === 0 ? '#F59E0B' : '#38BDF8',
                alpha: 0.85,
                lineWidth: 2.5,
              });
              flares.push({
                x: bx,
                y: by,
                radius: 12,
                maxRadius: 95,
                points: 8,
                rot: 0,
                vrot: 0.06,
                color: '#FDE047',
                life: 24,
                maxLife: 24,
              });
              spawnParticles(
                bx,
                by,
                38,
                ['#F59E0B', '#FDE047', '#38BDF8', '#34D399', '#FFFFFF'],
                2.5,
                9.5,
                42,
                78,
                0.05
              );
            },
          });
        }
      }
    };

    const unsubscribe = vfxBus.subscribe(handleEvent);

    let rafId = 0;
    const render = () => {
      const { combo: curCombo, isFever: curFever, fxIntensity: curMode } = stateRef.current;

      // Process frame-delayed wavefront tasks
      for (let i = delayedTasks.length - 1; i >= 0; i--) {
        delayedTasks[i].framesLeft -= 1;
        if (delayedTasks[i].framesLeft <= 0) {
          const task = delayedTasks[i];
          delayedTasks.splice(i, 1);
          task.run();
        }
      }

      // 1. Background Warp Starfield
      bgCtx.clearRect(0, 0, width, height);
      const targetSpeed =
        prefersReducedMotion || curMode === 'minimal'
          ? 0.25
          : curFever
            ? 16
            : Math.min(8.5, 0.75 + curCombo * 0.32);
      currentSpeed += (targetSpeed - currentSpeed) * 0.08;

      const cx = width * 0.5;
      const cy = height * 0.5;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.pz = s.z;
        s.z -= currentSpeed;

        if (s.z <= 1) {
          s.x = (Math.random() - 0.5) * width * 1.4;
          s.y = (Math.random() - 0.5) * height * 1.4;
          s.z = width;
          s.pz = s.z;
        }

        const sx = (s.x / s.z) * width * 0.5 + cx;
        const sy = (s.y / s.z) * height * 0.5 + cy;
        const px = (s.x / s.pz) * width * 0.5 + cx;
        const py = (s.y / s.pz) * height * 0.5 + cy;

        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;

        const depthAlpha = Math.max(0.12, Math.min(0.95, 1 - s.z / width));
        const r = Math.max(0.6, (1 - s.z / width) * s.size * 1.75);

        if (currentSpeed > 2.1) {
          bgCtx.beginPath();
          bgCtx.strokeStyle = curFever
            ? `rgba(253, 224, 71, ${depthAlpha * 0.7})`
            : `rgba(186, 230, 253, ${depthAlpha * 0.52})`;
          bgCtx.lineWidth = r;
          bgCtx.moveTo(px, py);
          bgCtx.lineTo(sx, sy);
          bgCtx.stroke();
        } else {
          bgCtx.fillStyle = s.hue;
          bgCtx.globalAlpha = depthAlpha * 0.78;
          bgCtx.beginPath();
          bgCtx.arc(sx, sy, r, 0, Math.PI * 2);
          bgCtx.fill();
          bgCtx.globalAlpha = 1;
        }
      }

      // 2. Foreground Systematic VFX Layer
      fxCtx.clearRect(0, 0, width, height);

      // 2a. Edge Vignette Pulse & Brief Additive Screen Flash
      if (edgePulseAlpha > 0.01) {
        const grad = fxCtx.createRadialGradient(
          cx,
          cy,
          Math.min(width, height) * 0.28,
          cx,
          cy,
          Math.max(width, height) * 0.72
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, edgePulseColor);
        fxCtx.save();
        fxCtx.globalCompositeOperation = 'lighter';
        fxCtx.globalAlpha = edgePulseAlpha * 0.45;
        fxCtx.fillStyle = grad;
        fxCtx.fillRect(0, 0, width, height);
        fxCtx.restore();
        edgePulseAlpha *= 0.88;
      }

      if (screenFlashAlpha > 0.006) {
        fxCtx.save();
        fxCtx.globalCompositeOperation = 'lighter';
        fxCtx.globalAlpha = screenFlashAlpha;
        fxCtx.fillStyle = screenFlashColor;
        fxCtx.fillRect(0, 0, width, height);
        fxCtx.restore();
        screenFlashAlpha *= 0.76;
      }

      // 2b. Physical Tile Shatter Shards (normal composite for crisp geometry)
      for (let i = shards.length - 1; i >= 0; i--) {
        const sh = shards[i];
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.vx *= 0.94;
        sh.vy = sh.vy * 0.94 + 0.16;
        sh.rot += sh.vrot;
        sh.life -= 1;
        if (sh.life <= 0) {
          shards.splice(i, 1);
          continue;
        }
        const a = Math.max(0, sh.life / sh.maxLife);
        const s = sh.size * (0.4 + a * 0.6);
        fxCtx.save();
        fxCtx.globalAlpha = Math.min(1, a * 1.2);
        fxCtx.translate(sh.x, sh.y);
        fxCtx.rotate(sh.rot);
        fxCtx.beginPath();
        fxCtx.moveTo(-s * 0.7, -s * 0.5);
        fxCtx.lineTo(s * 0.8, -s * 0.25);
        fxCtx.lineTo(s * 0.2, s * 0.75);
        fxCtx.closePath();
        fxCtx.fillStyle = sh.fill;
        fxCtx.fill();
        fxCtx.strokeStyle = sh.edge;
        fxCtx.lineWidth = 1.4;
        fxCtx.stroke();
        fxCtx.restore();
      }

      // === Additive ('lighter') Energy Layer: Fireballs, Slashes, Shockwaves, Star Flares, Lightning, Orbs, Particles ===
      fxCtx.save();
      fxCtx.globalCompositeOperation = 'lighter';

      // 2b-ii. Volumetric Supernova Fireball Plumes
      for (let i = fireballs.length - 1; i >= 0; i--) {
        const fb = fireballs[i];
        fb.x += fb.vx;
        fb.y += fb.vy;
        fb.vx *= 0.92;
        fb.vy *= 0.92;
        fb.life -= 1;
        if (fb.life <= 0) {
          fireballs.splice(i, 1);
          continue;
        }
        const progress = 1 - fb.life / fb.maxLife;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const curRadius = fb.radius + (fb.maxRadius - fb.radius) * easeOut;
        const alpha = progress < 0.15 ? 0.95 : Math.max(0, (1 - progress) * 0.95);

        const grad = fxCtx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, curRadius);
        grad.addColorStop(0, fb.coreColor);
        grad.addColorStop(0.28, fb.midColor);
        grad.addColorStop(0.68, fb.outerColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        fxCtx.globalAlpha = alpha;
        fxCtx.fillStyle = grad;
        fxCtx.beginPath();
        fxCtx.arc(fb.x, fb.y, curRadius, 0, Math.PI * 2);
        fxCtx.fill();
      }

      // 2c. Orbital Light Slashes (Tier 4-5 & Supernova)
      for (let i = slashes.length - 1; i >= 0; i--) {
        const sl = slashes[i];
        sl.life -= 1;
        if (sl.life <= 0) {
          slashes.splice(i, 1);
          continue;
        }
        const t = sl.life / sl.maxLife;
        const curWidth = sl.width * t * t;
        fxCtx.save();
        fxCtx.translate(sl.x, sl.y);
        fxCtx.rotate(sl.angle);

        const grad = fxCtx.createLinearGradient(-sl.length * 0.5, 0, sl.length * 0.5, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.35, sl.color);
        grad.addColorStop(0.5, '#FFFFFF');
        grad.addColorStop(0.65, sl.color);
        grad.addColorStop(1, 'rgba(255,255,255,0)');

        fxCtx.globalAlpha = Math.min(1, t * 1.3);
        fxCtx.fillStyle = grad;
        fxCtx.fillRect(-sl.length * 0.5, -curWidth * 0.5, sl.length, curWidth);
        fxCtx.restore();
      }

      // 2d. Concentric Shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += (sw.maxRadius - sw.radius) * 0.17 + 2.8;
        sw.alpha *= 0.87;
        if (sw.alpha < 0.025 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(i, 1);
          continue;
        }
        fxCtx.beginPath();
        fxCtx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        fxCtx.strokeStyle = sw.color;
        fxCtx.globalAlpha = sw.alpha;
        fxCtx.lineWidth = sw.lineWidth * (0.4 + sw.alpha * 0.6);
        fxCtx.stroke();
      }

      // 2e. Star Flares (4-point & 8-point radiant starbursts)
      for (let i = flares.length - 1; i >= 0; i--) {
        const fl = flares[i];
        fl.life -= 1;
        fl.rot += fl.vrot;
        if (fl.life <= 0) {
          flares.splice(i, 1);
          continue;
        }
        const progress = 1 - fl.life / fl.maxLife;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const rOuter = fl.radius + (fl.maxRadius - fl.radius) * easeOut;
        const rInner = rOuter * 0.14;
        const alpha = Math.max(0, 1 - progress);

        fxCtx.save();
        fxCtx.translate(fl.x, fl.y);
        fxCtx.rotate(fl.rot);
        fxCtx.globalAlpha = alpha;

        // Soft glowing core halo
        const coreGrad = fxCtx.createRadialGradient(0, 0, 0, 0, 0, rOuter * 0.55);
        coreGrad.addColorStop(0, '#FFFFFF');
        coreGrad.addColorStop(0.35, fl.color);
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        fxCtx.fillStyle = coreGrad;
        fxCtx.beginPath();
        fxCtx.arc(0, 0, rOuter * 0.55, 0, Math.PI * 2);
        fxCtx.fill();

        // Razor star spikes
        fxCtx.beginPath();
        const spikes = fl.points;
        for (let s = 0; s < spikes * 2; s++) {
          const ang = (s * Math.PI) / spikes;
          const dist = s % 2 === 0 ? rOuter : rInner;
          const px = Math.cos(ang) * dist;
          const py = Math.sin(ang) * dist;
          if (s === 0) fxCtx.moveTo(px, py);
          else fxCtx.lineTo(px, py);
        }
        fxCtx.closePath();
        fxCtx.fillStyle = '#FFFFFF';
        fxCtx.fill();
        fxCtx.restore();
      }

      // 2f. Chain Lightning Plasma Arcs
      for (let i = arcs.length - 1; i >= 0; i--) {
        const arc = arcs[i];
        arc.life -= 1;
        if (arc.life <= 0) {
          arcs.splice(i, 1);
          continue;
        }
        const a = arc.life / arc.maxLife;
        fxCtx.beginPath();
        arc.points.forEach((pt, idx) => {
          if (idx === 0) fxCtx.moveTo(pt.x, pt.y);
          else fxCtx.lineTo(pt.x, pt.y);
        });
        fxCtx.strokeStyle = arc.color;
        fxCtx.globalAlpha = a * 0.9;
        fxCtx.lineWidth = arc.width * 2.2;
        fxCtx.stroke();

        fxCtx.strokeStyle = '#FFFFFF';
        fxCtx.globalAlpha = a;
        fxCtx.lineWidth = arc.width * 0.7;
        fxCtx.stroke();
      }

      // 2g. Homing Score Orbs (curving straight into the Score HUD!)
      for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        orb.age += 1;

        const dx = orb.tx - orb.x;
        const dy = orb.ty - orb.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 18 || orb.age > 75) {
          // Arrival sparkle burst at Score HUD!
          spawnParticles(orb.tx, orb.ty, 5, [orb.color, '#FFFFFF'], 1.2, 3.6, 10, 20, 0, ['spark']);
          if (orb.pitchStep < 4) {
            soundEngine.playOrbCollect(orb.pitchStep);
          }
          stateRef.current.onOrbArrive?.();
          orbs.splice(i, 1);
          continue;
        }

        // Smooth magnetic steering: initial burst outward, then accelerates hard into target
        const steerStrength = orb.age < 8 ? 0.04 : Math.min(0.42, 0.09 + orb.age * 0.018);
        const desiredSpeed = 12 + orb.age * 0.55;
        const desVx = (dx / dist) * desiredSpeed;
        const desVy = (dy / dist) * desiredSpeed;
        orb.vx += (desVx - orb.vx) * steerStrength;
        orb.vy += (desVy - orb.vy) * steerStrength;
        orb.x += orb.vx;
        orb.y += orb.vy;

        orb.trail.push({ x: orb.x, y: orb.y });
        if (orb.trail.length > 8) orb.trail.shift();

        // Draw luminous comet tail
        if (orb.trail.length >= 2) {
          fxCtx.beginPath();
          orb.trail.forEach((pt, idx) => {
            if (idx === 0) fxCtx.moveTo(pt.x, pt.y);
            else fxCtx.lineTo(pt.x, pt.y);
          });
          fxCtx.strokeStyle = orb.color;
          fxCtx.globalAlpha = 0.75;
          fxCtx.lineWidth = 3.2;
          fxCtx.stroke();
        }

        fxCtx.globalAlpha = 1;
        fxCtx.fillStyle = '#FFFFFF';
        fxCtx.beginPath();
        fxCtx.arc(orb.x, orb.y, 3.6, 0, Math.PI * 2);
        fxCtx.fill();
      }

      // 2h. Sparks, Diamonds & Speed Streaks
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = Math.max(0, p.life / p.maxLife);
        fxCtx.globalAlpha = alpha;
        fxCtx.fillStyle = p.color;

        if (p.shape === 'diamond') {
          fxCtx.save();
          fxCtx.translate(p.x, p.y);
          fxCtx.rotate(Math.PI / 4);
          const s = p.size * alpha;
          fxCtx.fillRect(-s * 0.65, -s * 0.65, s * 1.3, s * 1.3);
          fxCtx.restore();
        } else if (p.shape === 'spark' || p.shape === 'streak') {
          fxCtx.strokeStyle = p.color;
          fxCtx.lineWidth = p.shape === 'streak' ? 2.2 : 1.5;
          const tailMult = p.shape === 'streak' ? 3.8 : 2.2;
          fxCtx.beginPath();
          fxCtx.moveTo(p.x, p.y);
          fxCtx.lineTo(p.x - p.vx * tailMult, p.y - p.vy * tailMult);
          fxCtx.stroke();
        } else {
          fxCtx.beginPath();
          fxCtx.arc(p.x, p.y, Math.max(0.8, p.size * alpha), 0, Math.PI * 2);
          fxCtx.fill();
        }
      }

      fxCtx.restore(); // End additive blending

      // 2i. Kinetic Floating Score & Tier Callouts (crisp legibility over everything)
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy;
        ft.vy *= 0.94;
        ft.life -= 1;

        if (ft.life <= 0) {
          floatingTexts.splice(i, 1);
          continue;
        }

        const progress = 1 - ft.life / ft.maxLife;
        const popScale =
          progress < 0.14
            ? 0.65 + (progress / 0.14) * 0.55
            : 1.2 - Math.min(0.2, (progress - 0.14) * 0.55);
        const alpha = progress > 0.66 ? Math.max(0, (1 - progress) / 0.34) : 1;

        fxCtx.save();
        fxCtx.globalAlpha = alpha;
        fxCtx.translate(ft.x, ft.y);
        fxCtx.scale(popScale * ft.scale, popScale * ft.scale);
        fxCtx.textAlign = 'center';

        if (ft.tierTitle) {
          fxCtx.font = '700 10px "JetBrains Mono", "Outfit", sans-serif';
          fxCtx.lineWidth = 3;
          fxCtx.strokeStyle = 'rgba(7, 11, 20, 0.95)';
          fxCtx.strokeText(ft.tierTitle, 0, -16);
          fxCtx.fillStyle = '#FDE68A';
          fxCtx.fillText(ft.tierTitle, 0, -16);
        }

        fxCtx.font = '700 16px "JetBrains Mono", "Outfit", sans-serif';
        fxCtx.lineWidth = 4;
        fxCtx.strokeStyle = 'rgba(7, 11, 20, 0.95)';
        fxCtx.strokeText(ft.text, 0, 0);
        fxCtx.fillStyle = ft.color;
        fxCtx.fillText(ft.text, 0, 0);

        if (ft.sublabel) {
          fxCtx.font = '700 10px "Noto Sans JP", sans-serif';
          fxCtx.lineWidth = 3;
          fxCtx.strokeText(ft.sublabel, 0, 14);
          fxCtx.fillStyle = '#F8FAFC';
          fxCtx.fillText(ft.sublabel, 0, 14);
        }
        fxCtx.restore();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      unsubscribe();
    };
  }, []);

  return (
    <>
      <canvas
        ref={bgCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      <canvas
        ref={fxCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-40 h-full w-full"
      />
    </>
  );
}
