import React from 'react';
import {
  BookOpen,
  FastForward,
  LogOut,
  Play,
  RotateCcw,
  ShieldCheck,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LEVEL_CONFIGS } from '../game/config';
import { ChatMessage, PlayerRecord, ServerRoomSnapshot } from '../game/types';
import { ChatPanel } from './ChatPanel';

interface AdminDashboardProps {
  room: ServerRoomSnapshot;
  sortedPlayers: PlayerRecord[];
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onStartGame: () => void;
  onEndRound: () => void;
  onNextLevel: () => void;
  onResetLobby: () => void;
  onOpenQuestionManager: () => void;
  onLogout: () => void;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  room,
  sortedPlayers,
  chatMessages,
  onSendMessage,
  isMuted,
  onToggleMute,
  onStartGame,
  onEndRound,
  onNextLevel,
  onResetLobby,
  onOpenQuestionManager,
  onLogout,
}) => {
  const cfg = LEVEL_CONFIGS[room.currentLevel];
  const activeCount = sortedPlayers.filter((p) => p.status === 'Playing').length;
  const totalQuestions =
    (room.questionCounts?.[1] ?? 0) +
    (room.questionCounts?.[2] ?? 0) +
    (room.questionCounts?.[3] ?? 0);

  const phaseLabel =
    room.serverPhase === 'WaitingRoom'
      ? 'Ruang Tunggu'
      : room.serverPhase === 'Playing'
      ? `Berlangsung · Level ${cfg.index}: ${cfg.name}`
      : room.serverPhase === 'EliminationReport'
      ? 'Laporan Seleksi Babak'
      : 'Podium Juara';

  return (
    <>
      {/* Top 3-zone Admin bar */}
      <header className="fixed top-0 inset-x-0 z-30 flex items-center justify-between gap-4 px-4 md:px-6 py-2.5 bg-slate-950/92 border-b border-slate-800 text-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm md:text-base text-white truncate">
              Panel Guru (Admin)
            </div>
            <div className="text-xs text-slate-400 truncate">{phaseLabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="font-mono tabular-nums text-lg md:text-xl font-bold px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-amber-300">
            {formatTimer(room.timeLeft)}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Aktifkan Suara' : 'Matikan Suara'}
            className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer shrink-0"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Admin Control & Classroom Roster Panel */}
      <aside className="fixed top-16 left-4 z-30 w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-950/95 border border-slate-700 p-5 shadow-2xl text-slate-100 max-h-[calc(100vh-5rem)] flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 font-display font-bold text-base text-white">
            <Users className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Daftar Siswa Terhubung</span>
          </div>
          <span className="font-mono tabular-nums text-xs text-slate-300">
            {sortedPlayers.length} Siswa · {activeCount} Aktif
          </span>
        </div>

        <div className="flex-1 min-h-32 max-h-64 overflow-y-auto divide-y divide-slate-800/80 border-t border-b border-slate-800 py-1 mb-4">
          {sortedPlayers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Belum ada siswa yang login ke Ruang Tunggu.
            </div>
          ) : (
            sortedPlayers.map((p, idx) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono tabular-nums text-slate-500 w-5">#{idx + 1}</span>
                  <span
                    className={`truncate ${
                      p.status === 'Eliminated' ? 'text-slate-500 line-through' : 'text-slate-100 font-medium'
                    }`}
                  >
                    {p.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-slate-400">
                    {room.serverPhase === 'WaitingRoom'
                      ? p.avatarId
                      : p.status === 'Eliminated'
                      ? 'Penonton'
                      : `${p.correctCount} Benar`}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-amber-300 w-14 text-right">
                    {p.score}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {room.serverPhase === 'EliminationReport' && room.eliminationSummary && (
          <div className="mb-4 rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs text-slate-300">
            <div className="font-semibold text-white mb-1">
              Seleksi Level {room.eliminationSummary.completedLevel} Selesai
            </div>
            <div>
              {room.eliminationSummary.eliminatedPlayers.length} siswa tereliminasi ·{' '}
              {room.eliminationSummary.survivorCount} siswa lolos ke Level{' '}
              {room.eliminationSummary.nextLevel}.
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {room.serverPhase === 'WaitingRoom' && (
            <>
              <button
                type="button"
                onClick={onStartGame}
                disabled={sortedPlayers.length === 0}
                className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span>Mulai Permainan Sekarang</span>
              </button>
              {sortedPlayers.length === 0 && (
                <p className="text-xs text-slate-400 text-center">
                  Menunggu minimal 1 siswa masuk ke Ruang Tunggu.
                </p>
              )}
            </>
          )}

          {room.serverPhase === 'Playing' && (
            <button
              type="button"
              onClick={onEndRound}
              className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FastForward className="w-4 h-4 shrink-0" />
              <span>Akhiri Babak Sekarang</span>
            </button>
          )}

          {room.serverPhase === 'EliminationReport' && room.eliminationSummary && (
            <button
              type="button"
              onClick={onNextLevel}
              className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>Lanjut ke Level {room.eliminationSummary.nextLevel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenQuestionManager}
            className="w-full min-h-10 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 hover:bg-slate-800 text-slate-100 font-semibold text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="inline-flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Kelola Bank Soal</span>
            </span>
            <span className="font-mono tabular-nums text-amber-300">
              {totalQuestions} Soal
            </span>
          </button>

          {room.serverPhase !== 'WaitingRoom' && (
            <button
              type="button"
              onClick={onResetLobby}
              className="w-full min-h-10 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Reset ke Ruang Tunggu</span>
            </button>
          )}
        </div>
      </aside>

      {/* Top-Right Class Chat for Teacher */}
      <div className="fixed top-16 right-4 z-30 flex flex-col items-end pointer-events-none">
        <ChatPanel
          messages={chatMessages}
          localPlayerId={null}
          isAdmin={true}
          onSendMessage={onSendMessage}
          defaultOpen={false}
        />
      </div>
    </>
  );
};
