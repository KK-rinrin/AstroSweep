import { useEffect, useState } from 'react';
import { Minus, Plus, Play, RotateCcw } from 'lucide-react';
import { BOARD_LIMITS, BOARD_PRESETS, BoardConfig } from '../game/types';
import {
  clampBoardConfig,
  getDensityInfo,
  getInitialScannerCharges,
  getMaxMines,
} from '../game/engine';

interface FieldConfigPanelProps {
  currentConfig: BoardConfig;
  onApplyAndStart: (config: BoardConfig) => void;
  onCancel?: () => void;
}

const DENSITY_SHORTCUTS = [
  { label: '快適 12%', ratio: 0.12 },
  { label: '標準 17%', ratio: 0.17 },
  { label: '高難度 24%', ratio: 0.24 },
  { label: '極限 35%', ratio: 0.35 },
];

export function FieldConfigPanel({
  currentConfig,
  onApplyAndStart,
  onCancel,
}: FieldConfigPanelProps) {
  const [draft, setDraft] = useState<BoardConfig>(currentConfig);

  useEffect(() => {
    setDraft(currentConfig);
  }, [currentConfig]);

  const maxMines = getMaxMines(draft.cols, draft.rows);
  const totalCells = draft.cols * draft.rows;
  const density = getDensityInfo(draft.cols, draft.rows, draft.mines);
  const initialScannerCharges = getInitialScannerCharges(draft.cols, draft.rows, draft.mines);

  const updateDraft = (patch: Partial<BoardConfig>) => {
    setDraft((prev) => clampBoardConfig({ ...prev, ...patch }));
  };

  const handlePresetClick = (preset: (typeof BOARD_PRESETS)[number]) => {
    setDraft({
      presetId: preset.id,
      cols: preset.cols,
      rows: preset.rows,
      mines: preset.mines,
    });
  };

  const applyDensityRatio = (ratio: number) => {
    const mines = Math.max(1, Math.min(maxMines, Math.round(totalCells * ratio)));
    updateDraft({ mines });
  };

  // Visual preview grid geometry (capped to clean scaled box)
  const previewMaxWidth = 260;
  const previewMaxHeight = 160;
  const cellPreviewSize = Math.max(
    4,
    Math.min(
      Math.floor(previewMaxWidth / draft.cols),
      Math.floor(previewMaxHeight / draft.rows)
    )
  );
  const previewWidth = cellPreviewSize * draft.cols;
  const previewHeight = cellPreviewSize * draft.rows;

  return (
    <section
      aria-label="フィールド設定"
      className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-800/90 bg-[#0F1626]/92 p-6 shadow-2xl backdrop-blur-md sm:p-8"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-50">
            宙域フィールド設定
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            プリセット選択、またはスライダーで横幅・縦幅・地雷数を自由に調整できます。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono-tabular">
          <span>
            {draft.cols} × {draft.rows}
          </span>
          <span aria-hidden="true">·</span>
          <span>総マス {totalCells}</span>
          <span aria-hidden="true">·</span>
          <span className="text-amber-300">
            地雷密度 {density.percent.toFixed(1)}%（{density.label}）
          </span>
        </div>
      </div>

      {/* Presets */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-slate-300">宙域プリセット</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {BOARD_PRESETS.map((preset) => {
            const active = draft.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={`flex flex-col items-start rounded-xl border px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                  active
                    ? 'border-amber-400/80 bg-amber-400/12 text-slate-50'
                    : 'border-slate-800 bg-[#0A101D]/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex w-full items-baseline justify-between gap-2">
                  <span className="font-display text-base font-bold text-slate-50 whitespace-nowrap">
                    {preset.name}
                  </span>
                  <span className="font-mono-tabular text-xs text-amber-300 whitespace-nowrap">
                    {preset.cols}×{preset.rows} · 地雷 {preset.mines}
                  </span>
                </div>
                <span className="mt-1 text-xs text-slate-400">{preset.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Sliders + Live Proportion Preview */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {/* Columns Slider */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="slider-cols" className="text-sm font-semibold text-slate-200">
                横幅（列数）
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="横幅を減らす"
                  onClick={() => updateDraft({ cols: draft.cols - 1 })}
                  disabled={draft.cols <= BOARD_LIMITS.minCols}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono-tabular w-12 text-center text-base font-bold text-slate-50">
                  {draft.cols}
                </span>
                <button
                  type="button"
                  aria-label="横幅を増やす"
                  onClick={() => updateDraft({ cols: draft.cols + 1 })}
                  disabled={draft.cols >= BOARD_LIMITS.maxCols}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input
              id="slider-cols"
              type="range"
              min={BOARD_LIMITS.minCols}
              max={BOARD_LIMITS.maxCols}
              value={draft.cols}
              onChange={(e) => updateDraft({ cols: Number(e.target.value) })}
              className="cosmic-slider mt-3 w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500 font-mono-tabular">
              <span>{BOARD_LIMITS.minCols}</span>
              <span>{BOARD_LIMITS.maxCols}</span>
            </div>
          </div>

          {/* Rows Slider */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="slider-rows" className="text-sm font-semibold text-slate-200">
                縦幅（行数）
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="縦幅を減らす"
                  onClick={() => updateDraft({ rows: draft.rows - 1 })}
                  disabled={draft.rows <= BOARD_LIMITS.minRows}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono-tabular w-12 text-center text-base font-bold text-slate-50">
                  {draft.rows}
                </span>
                <button
                  type="button"
                  aria-label="縦幅を増やす"
                  onClick={() => updateDraft({ rows: draft.rows + 1 })}
                  disabled={draft.rows >= BOARD_LIMITS.maxRows}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input
              id="slider-rows"
              type="range"
              min={BOARD_LIMITS.minRows}
              max={BOARD_LIMITS.maxRows}
              value={draft.rows}
              onChange={(e) => updateDraft({ rows: Number(e.target.value) })}
              className="cosmic-slider mt-3 w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500 font-mono-tabular">
              <span>{BOARD_LIMITS.minRows}</span>
              <span>{BOARD_LIMITS.maxRows}</span>
            </div>
          </div>

          {/* Mines Slider */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="slider-mines" className="text-sm font-semibold text-slate-200">
                地雷（ブラックホール機雷）の数
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="地雷を減らす"
                  onClick={() => updateDraft({ mines: draft.mines - 1 })}
                  disabled={draft.mines <= BOARD_LIMITS.minMines}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono-tabular w-12 text-center text-base font-bold text-amber-300">
                  {draft.mines}
                </span>
                <button
                  type="button"
                  aria-label="地雷を増やす"
                  onClick={() => updateDraft({ mines: draft.mines + 1 })}
                  disabled={draft.mines >= maxMines}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input
              id="slider-mines"
              type="range"
              min={BOARD_LIMITS.minMines}
              max={maxMines}
              value={draft.mines}
              onChange={(e) => updateDraft({ mines: Number(e.target.value) })}
              className="cosmic-slider mt-3 w-full"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {DENSITY_SHORTCUTS.map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  onClick={() => applyDensityRatio(sc.ratio)}
                  className="rounded-md border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-amber-400/60 hover:text-amber-200 whitespace-nowrap"
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Live Grid Scale Preview */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0A101D]/80 p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>フィールド比率プレビュー</span>
              <span className="font-mono-tabular text-slate-200">
                安全マス {totalCells - draft.mines}
              </span>
            </div>

            <div className="mt-5 flex min-h-[176px] items-center justify-center">
              <div
                style={{
                  width: `${previewWidth}px`,
                  height: `${previewHeight}px`,
                  backgroundImage:
                    'linear-gradient(to right, rgba(56,189,248,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.18) 1px, transparent 1px)',
                  backgroundSize: `${cellPreviewSize}px ${cellPreviewSize}px`,
                }}
                className="relative rounded border border-sky-400/40 bg-slate-900/80 transition-all duration-150"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-x-0 bottom-0 bg-amber-400/18 transition-all duration-150"
                  style={{ height: `${Math.min(100, density.percent * 1.4)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>推定難易度</span>
              <span className="font-semibold text-slate-100">{density.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>安全スキャン初期上限</span>
              <span className="font-mono-tabular font-semibold text-sky-300">
                {initialScannerCharges} 回（5コンボ毎に+1回復）
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>初手安全保証</span>
              <span className="text-emerald-400">有効（初回0展開優先）</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6">
        <button
          type="button"
          onClick={() => handlePresetClick(BOARD_PRESETS[0])}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 whitespace-nowrap"
        >
          <RotateCcw className="h-4 w-4" />
          初期値に戻す
        </button>

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 whitespace-nowrap"
            >
              戻る
            </button>
          )}
          <button
            type="button"
            onClick={() => onApplyAndStart(draft)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap"
          >
            <Play className="h-4 w-4 fill-current" />
            この設定で開始
          </button>
        </div>
      </div>
    </section>
  );
}
