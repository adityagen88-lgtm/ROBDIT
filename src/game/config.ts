import type { AvatarId, AvatarPreset, LevelConfig } from './types.ts';

export const GAME_CONSTANTS = {
  WRONG_ANSWER_COOLDOWN_SECONDS: 4,
  BOX_RESPAWN_SECONDS: 8,
  ELIMINATION_MIN: 5,
  ELIMINATION_MAX: 10,
  MIN_SURVIVORS_FOR_PODIUM: 3,
  DEFAULT_ADMIN_PIN: 'GURU123',
};

export const AVATAR_PRESETS: Record<AvatarId, AvatarPreset> = {
  Rimbi: {
    id: 'Rimbi',
    displayName: 'Penjelajah Rimba',
    roleTitle: 'Pemandu Hutan',
    shirtHex: 0x2e8b57,
    shirtCss: '#2E8B57',
    pantsHex: 0x5c4033,
    hatHex: 0xc29b61,
    skinHex: 0xf1c27d,
    accentHex: 0xf59e0b,
  },
  Samudra: {
    id: 'Samudra',
    displayName: 'Penjelajah Samudra',
    roleTitle: 'Navigator Ombak',
    shirtHex: 0x0284c7,
    shirtCss: '#0284C7',
    pantsHex: 0x1e293b,
    hatHex: 0xe0f2fe,
    skinHex: 0xe0ac69,
    accentHex: 0x38bdf8,
  },
  Surya: {
    id: 'Surya',
    displayName: 'Penjelajah Emas',
    roleTitle: 'Pemburu Harta',
    shirtHex: 0xd97706,
    shirtCss: '#D97706',
    pantsHex: 0x451a03,
    hatHex: 0xfef3c7,
    skinHex: 0xd8a47f,
    accentHex: 0xfbbf24,
  },
  Kirana: {
    id: 'Kirana',
    displayName: 'Penjelajah Senja',
    roleTitle: 'Peneliti Cilik',
    shirtHex: 0xe11d48,
    shirtCss: '#E11D48',
    pantsHex: 0x312e81,
    hatHex: 0xfde68a,
    skinHex: 0xf5cba7,
    accentHex: 0xfb7185,
  },
};

export const LEVEL_CONFIGS: Record<1 | 2 | 3, LevelConfig> = {
  1: {
    index: 1,
    name: 'Hutan Pemula',
    subtitle: 'Operasi hitung dasar & kosakata',
    cognitiveTier: 'Kognitif C1–C2 (Mengingat & Memahami)',
    durationSeconds: 300, // 5 menit
    pointsPerCorrect: 10,
    activeBoxCount: 12,
    skyColor: 0x7dd3fc,
    fogColor: 0xbae6fd,
    groundColor: 0x3f8f4e,
    platformColor: 0x78553a,
    accentColor: 0x22c55e,
  },
  2: {
    index: 2,
    name: 'Kuil Misterius',
    subtitle: 'Soal cerita pendek & IPA dasar',
    cognitiveTier: 'Kognitif C3–C4 (Menerapkan & Menganalisis)',
    durationSeconds: 300, // 5 menit
    pointsPerCorrect: 20,
    activeBoxCount: 10,
    skyColor: 0x312e59,
    fogColor: 0x433868,
    groundColor: 0x57534e,
    platformColor: 0xa8a29e,
    accentColor: 0xf97316,
  },
  3: {
    index: 3,
    name: 'Gunung Emas',
    subtitle: 'Penalaran matematika & bahasa lanjut',
    cognitiveTier: 'Kognitif C4–C5 (Penalaran & Evaluasi)',
    durationSeconds: 240, // 4 menit
    pointsPerCorrect: 35,
    activeBoxCount: 8,
    skyColor: 0x451a03,
    fogColor: 0x78350f,
    groundColor: 0x44403c,
    platformColor: 0xd97706,
    accentColor: 0xfacc15,
  },
};
