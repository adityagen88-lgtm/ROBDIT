import React from 'react';
import { EliminationSummary } from '../game/types';
import { LEVEL_CONFIGS } from '../game/config';

interface EliminationModalProps {
  summary: EliminationSummary;
  localPlayerId: string | null;
}

export const EliminationModal: React.FC<EliminationModalProps> = ({
  summary,
  localPlayerId,
}) => {
  const completedCfg = LEVEL_CONFIGS[summary.completedLevel];
  const nextCfg = LEVEL_CONFIGS[summary.nextLevel];
  const localPlayerEliminated = Boolean(
    localPlayerId && summary.eliminatedPlayers.some((p) => p.id === localPlayerId)
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-700 p-6 md:p-7 shadow-2xl text-slate-100">
        <div className="text-xs text-slate-400 mb-2">
          Hasil Seleksi <span aria-hidden="true">·</span> {completedCfg.name}
        </div>

        <h2 className="font-display text-2xl font-bold text-white mb-2">
          {localPlayerEliminated
            ? 'Kamu Masuk Zona Penonton'
            : `Lolos ke Level ${summary.nextLevel}: ${nextCfg.name}`}
        </h2>

        <p className="text-sm text-slate-300 mb-5">
          {localPlayerEliminated
            ? 'Skor kamu termasuk dalam kelompok terendah babak ini. Kamu tetap dapat menyaksikan teman-teman berlomba hingga Podium.'
            : `${summary.eliminatedPlayers.length} penjelajah dengan skor terendah dipindahkan ke Zona Penonton. ${summary.survivorCount} penjelajah berlanjut ke arena berikutnya.`}
        </p>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 mb-5 max-h-48 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 mb-2">
            Peserta Tereliminasi ({summary.eliminatedPlayers.length} Skor Terendah)
          </div>
          {summary.eliminatedPlayers.length === 0 ? (
            <div className="py-2 text-xs text-slate-400">
              Semua penjelajah lolos ke babak berikutnya!
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {summary.eliminatedPlayers.map((p) => {
                const isMe = p.id === localPlayerId;
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span className={isMe ? 'font-bold text-rose-400' : 'text-slate-200'}>
                      {p.name} {isMe ? '(Kamu)' : ''}
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">{p.score} Poin</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-center text-xs font-semibold text-amber-300">
          Menunggu guru memulai Level {summary.nextLevel}...
        </div>
      </div>
    </div>
  );
};
