import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  LogOut,
  PackageOpen,
  Volume2,
  VolumeX,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ChatMessage, LevelConfig, PlayerRecord, QuizFeedbackState, RadarSnapshot } from '../game/types';
import { ChatPanel } from './ChatPanel';
import { MiniMap } from './MiniMap';

interface GameHUDProps {
  levelConfig: LevelConfig;
  timeLeft: number;
  isSpectator: boolean;
  localPlayer: PlayerRecord | undefined;
  sortedPlayers: PlayerRecord[];
  nearestBoxId: string | null;
  radar: RadarSnapshot | null;
  cooldownSeconds: number;
  feedback: QuizFeedbackState | null;
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenNearestBox: () => void;
  onTouchMove: (dx: number, dz: number) => void;
  onJump: () => void;
  onLogout: () => void;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  levelConfig,
  timeLeft,
  isSpectator,
  localPlayer,
  sortedPlayers,
  nearestBoxId,
  radar,
  cooldownSeconds,
  feedback,
  chatMessages,
  onSendMessage,
  isMuted,
  onToggleMute,
  onOpenNearestBox,
  onTouchMove,
  onJump,
  onLogout,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeCount = sortedPlayers.filter((p) => p.status === 'Playing').length;
  const localRank = localPlayer
    ? sortedPlayers.findIndex((p) => p.id === localPlayer.id) + 1
    : 0;
  const isUrgent = timeLeft > 0 && timeLeft <= 30;

  return (
    <>
      {/* Top 3-zone bar */}
      <header className="fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-4 px-4 md:px-6 py-2.5 bg-slate-950/92 border-b border-slate-800 text-slate-100">
        <div className="min-w-0">
          <div className="font-display font-bold text-sm md:text-base text-white truncate">
            Level {levelConfig.index}: {levelConfig.name}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {isSpectator ? 'Zona Penonton' : levelConfig.cognitiveTier}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`font-mono tabular-nums text-lg md:text-xl font-bold px-3 py-1 rounded-lg border ${
              isUrgent
                ? 'bg-rose-950 border-rose-500 text-rose-300'
                : 'bg-slate-900 border-slate-700 text-amber-300'
            }`}
          >
            {formatTimer(timeLeft)}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-mono tabular-nums text-sm md:text-base font-bold text-white">
              {localPlayer?.score ?? 0} Poin
            </div>
            <div className="text-xs text-slate-400 tabular-nums">
              Peringkat #{localRank}/{sortedPlayers.length} · {activeCount} Aktif
            </div>
          </div>
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
            aria-label="Keluar"
            className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Feedback Toast below TopBar */}
      {feedback && (
        <div className="fixed top-16 inset-x-0 z-20 flex justify-center px-4 pointer-events-none">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-xl text-sm font-medium ${
              feedback.isCorrect
                ? 'bg-emerald-950 border-emerald-500 text-emerald-100'
                : 'bg-rose-950 border-rose-500 text-rose-100'
            }`}
          >
            {feedback.isCorrect ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>
              <strong>{feedback.title}</strong> — {feedback.detail}
            </span>
          </div>
        </div>
      )}

      {/* Mini-Map Overlay (Top-Right) */}
      <MiniMap
        radar={radar}
        nearestBoxId={nearestBoxId}
        levelAccentColor={levelConfig.accentColor}
      />

      {/* Top-Left Stack: Spectator Notice (if eliminated) + Collapsible Class Chat */}
      <div className="fixed top-16 left-4 z-20 flex flex-col items-start gap-2.5 pointer-events-none">
        {isSpectator && (
          <div className="pointer-events-auto rounded-xl bg-slate-950/92 border border-slate-700 px-4 py-3 text-xs text-slate-200 max-w-xs shadow-2xl">
            <div className="font-semibold text-white mb-1">Mode Penonton Aktif</div>
            <p className="text-slate-400 mb-2.5">
              Kamu sedang menyaksikan siswa yang lolos menyelesaikan arena.
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer whitespace-nowrap"
            >
              Keluar ke Halaman Masuk
            </button>
          </div>
        )}

        <ChatPanel
          messages={chatMessages}
          localPlayerId={localPlayer?.id ?? null}
          onSendMessage={onSendMessage}
          defaultOpen={false}
        />
      </div>

      {/* Mystery Box Proximity Prompt */}
      {!isSpectator && nearestBoxId && (
        <div className="fixed bottom-24 inset-x-0 z-20 flex justify-center px-4 pointer-events-none">
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              onOpenNearestBox();
            }}
            disabled={cooldownSeconds > 0}
            className={`pointer-events-auto flex items-center gap-2.5 min-h-12 px-5 py-3 rounded-xl border font-display font-bold text-sm md:text-base shadow-2xl transition-colors cursor-pointer whitespace-nowrap ${
              cooldownSeconds > 0
                ? 'bg-slate-900 border-rose-500 text-rose-300'
                : 'bg-amber-400 hover:bg-amber-300 border-amber-200 text-slate-950'
            }`}
          >
            <PackageOpen className="w-5 h-5 shrink-0" />
            <span>
              {cooldownSeconds > 0
                ? `Jeda Jawaban Salah (${cooldownSeconds}d)`
                : 'Tekan E atau Ketuk Buka Mystery Box'}
            </span>
          </button>
        </div>
      )}

      {/* Touch / Tablet D-Pad & Jump Controls */}
      {!isSpectator && (
        <>
          <div className="fixed bottom-5 left-4 z-20 grid grid-cols-3 gap-1.5 w-36 h-36 md:opacity-80 hover:opacity-100">
            <div />
            <button
              type="button"
              aria-label="Maju"
              onPointerDown={(e) => {
                e.preventDefault();
                onTouchMove(0, -1);
              }}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerCancel={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex items-center justify-center rounded-xl bg-slate-950/90 border border-slate-700 text-white active:bg-amber-400 active:text-slate-950 select-none"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
            <div />
            <button
              type="button"
              aria-label="Kiri"
              onPointerDown={(e) => {
                e.preventDefault();
                onTouchMove(-1, 0);
              }}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerCancel={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex items-center justify-center rounded-xl bg-slate-950/90 border border-slate-700 text-white active:bg-amber-400 active:text-slate-950 select-none"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Mundur"
              onPointerDown={(e) => {
                e.preventDefault();
                onTouchMove(0, 1);
              }}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerCancel={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex items-center justify-center rounded-xl bg-slate-950/90 border border-slate-700 text-white active:bg-amber-400 active:text-slate-950 select-none"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Kanan"
              onPointerDown={(e) => {
                e.preventDefault();
                onTouchMove(1, 0);
              }}
              onPointerUp={() => onTouchMove(0, 0)}
              onPointerCancel={() => onTouchMove(0, 0)}
              onPointerLeave={() => onTouchMove(0, 0)}
              className="flex items-center justify-center rounded-xl bg-slate-950/90 border border-slate-700 text-white active:bg-amber-400 active:text-slate-950 select-none"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onJump();
            }}
            className="fixed bottom-8 right-4 z-20 min-h-14 px-5 py-3 rounded-2xl bg-slate-950/90 border border-slate-700 hover:border-amber-400 active:bg-amber-400 active:text-slate-950 text-white font-display font-bold text-sm shadow-xl select-none cursor-pointer"
          >
            Lompat (Spasi)
          </button>
        </>
      )}

      {/* Collapsible Bottom Leaderboard Dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[min(460px,90vw)] w-full pointer-events-none">
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-950/92 border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-200 shadow-lg cursor-pointer whitespace-nowrap"
        >
          {drawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          <span>{drawerOpen ? 'Tutup Papan Skor' : 'Papan Skor Kelas & Kontrol'}</span>
        </button>

        {drawerOpen && (
          <div className="pointer-events-auto mt-2 w-full rounded-2xl bg-slate-950/95 border border-slate-700 p-4 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2 pb-2 border-b border-slate-800">
              <span>WASD / Panah: Gerak · Spasi: Lompat · E: Buka Box</span>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/80">
              {sortedPlayers.map((p, idx) => {
                const isMe = p.id === localPlayer?.id;
                return (
                  <div key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono tabular-nums text-slate-500 w-5">#{idx + 1}</span>
                      <span
                        className={`truncate ${
                          isMe
                            ? 'font-bold text-amber-300'
                            : p.status === 'Eliminated'
                            ? 'text-slate-500 line-through'
                            : 'text-slate-200'
                        }`}
                      >
                        {p.name} {isMe ? '(Kamu)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-slate-500">
                        {p.status === 'Eliminated' ? 'Penonton' : 'Aktif'}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-white w-14 text-right">
                        {p.score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
