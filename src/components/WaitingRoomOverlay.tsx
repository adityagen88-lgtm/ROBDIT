import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LogOut,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChatMessage, PlayerRecord } from '../game/types';
import { ChatPanel } from './ChatPanel';

interface WaitingRoomOverlayProps {
  players: PlayerRecord[];
  localPlayerId: string | null;
  adminConnectedCount: number;
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onTouchMove: (dx: number, dz: number) => void;
  onJump: () => void;
  onLogout: () => void;
}

export const WaitingRoomOverlay: React.FC<WaitingRoomOverlayProps> = ({
  players,
  localPlayerId,
  adminConnectedCount,
  chatMessages,
  onSendMessage,
  isMuted,
  onToggleMute,
  onTouchMove,
  onJump,
  onLogout,
}) => {
  return (
    <>
      {/* Top compact waiting banner */}
      <header className="fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-4 px-4 md:px-6 py-2.5 bg-slate-950/92 border-b border-slate-800 text-slate-100">
        <div className="min-w-0">
          <div className="font-display font-bold text-sm md:text-base text-white truncate">
            Ruang Tunggu Kelas
          </div>
          <div className="text-xs text-slate-400 truncate">
            Menunggu guru memulai permainan · {players.length} Siswa Hadir
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

      {/* Non-occluding side roster card */}
      <aside className="fixed top-16 left-4 z-20 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-950/92 border border-slate-800 p-4 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-sm font-display font-bold text-white">
            <Users className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Peserta Ruang Tunggu</span>
          </div>
          <span className="font-mono tabular-nums text-xs font-bold text-amber-300">
            {players.length}
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          {adminConnectedCount > 0
            ? 'Guru sudah terhubung. Kamu bisa berjalan-jalan di halaman sambil menunggu babak dimulai.'
            : 'Menunggu guru masuk dan memulai permainan.'}
        </p>

        <div className="max-h-44 overflow-y-auto divide-y divide-slate-800/80 border-t border-b border-slate-800 py-1 mb-3">
          {players.map((p) => {
            const isMe = p.id === localPlayerId;
            return (
              <div key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                <span className={isMe ? 'font-bold text-amber-300 truncate' : 'text-slate-200 truncate'}>
                  {p.name} {isMe ? '(Kamu)' : ''}
                </span>
                <span className="text-slate-400 shrink-0 ml-2">{p.avatarId}</span>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-slate-400">
          WASD / Panah: Gerak · Spasi: Lompat
        </div>
      </aside>

      {/* Top-Right Class Chat in Waiting Room */}
      <div className="fixed top-16 right-4 z-20 flex flex-col items-end pointer-events-none">
        <ChatPanel
          messages={chatMessages}
          localPlayerId={localPlayerId}
          onSendMessage={onSendMessage}
          defaultOpen={false}
        />
      </div>

      {/* Touch D-Pad & Jump for mobile/tablet students in Waiting Room */}
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
  );
};
