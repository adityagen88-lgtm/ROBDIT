import React, { useState } from 'react';
import { AVATAR_PRESETS, GAME_CONSTANTS, LEVEL_CONFIGS } from '../game/config';
import { AvatarId } from '../game/types';
import { Compass, GraduationCap, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

interface LobbyOverlayProps {
  playerName: string;
  onNameChange: (name: string) => void;
  selectedAvatar: AvatarId;
  onSelectAvatar: (id: AvatarId) => void;
  onLoginStudent: () => void;
  onLoginAdmin: (pin: string) => void;
  waitingCount: number;
  isConnected: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const LobbyOverlay: React.FC<LobbyOverlayProps> = ({
  playerName,
  onNameChange,
  selectedAvatar,
  onSelectAvatar,
  onLoginStudent,
  onLoginAdmin,
  waitingCount,
  isConnected,
  authError,
  onClearAuthError,
  isMuted,
  onToggleMute,
}) => {
  const [tab, setTab] = useState<'student' | 'admin'>('student');
  const [adminPin, setAdminPin] = useState('');
  const avatars = Object.values(AVATAR_PRESETS);

  const switchTab = (next: 'student' | 'admin') => {
    setTab(next);
    onClearAuthError();
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) return;
    onLoginStudent();
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) return;
    onLoginAdmin(adminPin);
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-start p-4 md:p-8 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-slate-950/92 border border-slate-800 p-6 md:p-8 shadow-2xl text-slate-100 max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Compass className="w-6 h-6 text-amber-400 shrink-0" />
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white truncate">
              Petualangan Kuis Nusantara
            </h1>
          </div>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Aktifkan Suara' : 'Matikan Suara'}
            className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Permainan kuis petualangan multiplayer kelas SD. Siswa menunggu di Ruang Tunggu hingga Guru memulai babak.
        </p>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => switchTab('student')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'student'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4 shrink-0" />
            <span>Siswa (Pemain)</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('admin')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'admin'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Guru (Admin)</span>
          </button>
        </div>

        {authError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-950 border border-rose-500 text-rose-100 text-xs font-medium">
            {authError}
          </div>
        )}

        {tab === 'student' ? (
          <form onSubmit={handleStudentSubmit} className="space-y-5">
            <div>
              <label htmlFor="student-name" className="block text-xs font-semibold text-slate-300 mb-2">
                Nama Lengkap / Panggilan Siswa
              </label>
              <input
                id="student-name"
                type="text"
                maxLength={20}
                value={playerName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Contoh: Bima Kelas 5A"
                className="w-full h-11 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Pilih Karakter Penjelajah</span>
                <span className="text-xs text-slate-400">
                  {AVATAR_PRESETS[selectedAvatar].displayName}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {avatars.map((avatar) => {
                  const active = avatar.id === selectedAvatar;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => onSelectAvatar(avatar.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors min-h-12 cursor-pointer ${
                        active
                          ? 'bg-slate-800 border-amber-400 text-white'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-sm shrink-0 border border-white/20"
                        style={{ backgroundColor: avatar.shirtCss }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{avatar.id}</span>
                        <span className="block text-xs text-slate-400 truncate">{avatar.roleTitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
              <div className="flex justify-between">
                <span>1. {LEVEL_CONFIGS[1].name}</span>
                <span className="tabular-nums text-slate-300">5 Menit · C1–C2</span>
              </div>
              <div className="flex justify-between">
                <span>2. {LEVEL_CONFIGS[2].name}</span>
                <span className="tabular-nums text-slate-300">5 Menit · C3–C4</span>
              </div>
              <div className="flex justify-between">
                <span>3. {LEVEL_CONFIGS[3].name}</span>
                <span className="tabular-nums text-slate-300">4 Menit · C4–C5</span>
              </div>
            </div>

            <div className="text-xs text-slate-400 tabular-nums">
              {waitingCount > 0
                ? `${waitingCount} siswa sudah berada di Ruang Tunggu`
                : 'Belum ada siswa di Ruang Tunggu'}
            </div>

            <button
              type="submit"
              disabled={!isConnected}
              className="w-full min-h-12 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-display font-bold text-base transition-colors cursor-pointer whitespace-nowrap"
            >
              {isConnected ? 'Gabung Ruang Tunggu' : 'Menghubungkan ke Server...'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminSubmit} className="space-y-5">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
              <div className="font-semibold text-white">Panel Kontrol Guru / Admin</div>
              <p>
                Masuk sebagai Admin untuk memantau jumlah siswa di Ruang Tunggu, memulai permainan saat kelas siap, dan mengontrol transisi antar babak.
              </p>
              <div className="pt-1 text-slate-400">
                Kode Admin bawaan: <span className="font-mono font-bold text-amber-300">{GAME_CONSTANTS.DEFAULT_ADMIN_PIN}</span>
              </div>
            </div>

            <div>
              <label htmlFor="admin-pin" className="block text-xs font-semibold text-slate-300 mb-2">
                Kode Akses Guru (PIN)
              </label>
              <input
                id="admin-pin"
                type="password"
                maxLength={24}
                value={adminPin}
                onChange={(e) => {
                  setAdminPin(e.target.value);
                  if (authError) onClearAuthError();
                }}
                placeholder="Masukkan kode guru (contoh: GURU123)"
                className="w-full h-11 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="text-xs text-slate-400 tabular-nums">
              {waitingCount} siswa terhubung saat ini
            </div>

            <button
              type="submit"
              disabled={!isConnected}
              className="w-full min-h-12 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-display font-bold text-base transition-colors cursor-pointer whitespace-nowrap"
            >
              {isConnected ? 'Masuk sebagai Admin' : 'Menghubungkan ke Server...'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
