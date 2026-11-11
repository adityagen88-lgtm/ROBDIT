import React from 'react';
import { PlayerRecord } from '../game/types';
import { Trophy } from 'lucide-react';

interface PodiumOverlayProps {
  topThree: PlayerRecord[];
  localPlayer: PlayerRecord | undefined;
  isAdmin: boolean;
  onResetLobby: () => void;
  onLogout: () => void;
}

export const PodiumOverlay: React.FC<PodiumOverlayProps> = ({
  topThree,
  localPlayer,
  isAdmin,
  onResetLobby,
  onLogout,
}) => {
  return (
    <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-slate-950/92 border border-slate-700 p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h2 className="font-display text-xl md:text-2xl font-bold text-white">
                Podium Juara Petualangan
              </h2>
              <p className="text-xs text-slate-400">
                Tiga penjelajah dengan skor akhir tertinggi di Gunung Emas
              </p>
            </div>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={onResetLobby}
              className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Kembali ke Ruang Tunggu
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 font-display font-bold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Keluar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {topThree.map((winner, idx) => {
            const isMe = winner.id === localPlayer?.id;
            return (
              <div
                key={winner.id}
                className={`rounded-xl p-4 border ${
                  idx === 0
                    ? 'bg-amber-500/15 border-amber-400/70'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="text-xs text-slate-400 mb-1">
                  Juara {idx + 1} <span aria-hidden="true">·</span> {winner.correctCount} Jawaban Benar
                </div>
                <div className="font-display font-bold text-base text-white truncate">
                  {winner.name} {isMe ? '(Kamu)' : ''}
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-amber-400 mt-1">
                  {winner.score} Poin
                </div>
              </div>
            );
          })}
        </div>

        {localPlayer && !topThree.some((w) => w.id === localPlayer.id) && (
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-sm text-slate-300">
            <span>Skor Akhir Kamu ({localPlayer.name})</span>
            <span className="font-mono tabular-nums font-bold text-white">
              {localPlayer.score} Poin
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
