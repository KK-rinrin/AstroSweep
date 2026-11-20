import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { RecordsSummary } from '../game/types';

interface RecordsPanelProps {
  records: RecordsSummary;
  onClearRecords: () => void;
  onBackToPlay: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RecordsPanel({ records, onClearRecords, onBackToPlay }: RecordsPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const winRate =
    records.totalGames > 0
      ? Math.round((records.totalWins / records.totalGames) * 100)
      : 0;

  return (
    <section
      aria-label="プレイ記録"
      className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-800/90 bg-[#0F1626]/92 p-6 shadow-2xl backdrop-blur-md sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-50">
            探査レコード
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            このブラウザに保存されたスコア・最大コンボ・クリア履歴です。
          </p>
        </div>

        <div className="flex items-center gap-3">
          {records.entries.length > 0 &&
            (confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearRecords();
                    setConfirmClear(false);
                  }}
                  className="rounded-lg bg-rose-500 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-400 whitespace-nowrap"
                >
                  本当に削除
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/60 hover:text-rose-300 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                履歴を消去
              </button>
            ))}

          <button
            type="button"
            onClick={onBackToPlay}
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-300 whitespace-nowrap"
          >
            ゲームへ戻る
          </button>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800/80 bg-[#0A101D]/75 p-4">
          <p className="text-xs text-slate-400">最高スコア</p>
          <p className="font-mono-tabular mt-1.5 text-2xl font-bold text-amber-300">
            {records.bestScore.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-[#0A101D]/75 p-4">
          <p className="text-xs text-slate-400">最大コンボ</p>
          <p className="font-mono-tabular mt-1.5 text-2xl font-bold text-sky-300">
            {records.bestCombo}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-[#0A101D]/75 p-4">
          <p className="text-xs text-slate-400">クリア数 / 勝率</p>
          <p className="font-mono-tabular mt-1.5 text-2xl font-bold text-emerald-300">
            {records.totalWins}{' '}
            <span className="text-sm font-medium text-slate-400">({winRate}%)</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-[#0A101D]/75 p-4">
          <p className="text-xs text-slate-400">累計開拓マス</p>
          <p className="font-mono-tabular mt-1.5 text-2xl font-bold text-slate-100">
            {records.totalCellsCleared.toLocaleString()}
          </p>
        </div>
      </div>

      {/* History Table */}
      <div className="mt-8">
        {records.entries.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-[#0A101D]/60 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-300">まだプレイ履歴がありません</p>
            <p className="mt-1 text-xs text-slate-500">
              1ゲーム完了するとスコアとコンボ記録が自動で保存されます。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-3 pr-4 font-medium">結果</th>
                  <th className="py-3 pr-4 font-medium">宙域</th>
                  <th className="py-3 pr-4 font-medium">サイズ · 地雷</th>
                  <th className="py-3 pr-4 font-medium text-right">スコア</th>
                  <th className="py-3 pr-4 font-medium text-right">最大コンボ</th>
                  <th className="py-3 font-medium text-right">タイム</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {records.entries.map((entry) => (
                  <tr key={entry.id} className="text-slate-200 hover:bg-slate-800/25">
                    <td className="py-3 pr-4 whitespace-nowrap font-semibold">
                      <span className={entry.won ? 'text-emerald-400' : 'text-rose-400'}>
                        {entry.won ? 'クリア' : '被弾'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-300">
                      {entry.presetLabel}
                    </td>
                    <td className="font-mono-tabular py-3 pr-4 whitespace-nowrap text-xs text-slate-400">
                      {entry.cols}×{entry.rows} · 地雷 {entry.mines}
                    </td>
                    <td className="font-mono-tabular py-3 pr-4 text-right font-bold text-amber-300">
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="font-mono-tabular py-3 pr-4 text-right text-sky-300">
                      {entry.maxCombo}
                    </td>
                    <td className="font-mono-tabular py-3 text-right text-slate-300">
                      {formatDuration(entry.timeSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
