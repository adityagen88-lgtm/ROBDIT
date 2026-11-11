// Web Audio API SoundService: Handles quiz result SFX ('success'/'fail') and adaptive level BGM intensity

export type MusicState = 'Lobby' | 'Level1' | 'Level2' | 'Level3' | 'Podium' | 'Stopped';

interface TrackProfile {
  bpm: number;
  notes: number[];
  bass: number[];
  waveform: OscillatorType;
  gain: number;
}

const TRACK_PROFILES: Record<Exclude<MusicState, 'Stopped'>, TrackProfile> = {
  Lobby: {
    bpm: 102,
    notes: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23],
    bass: [130.81, 130.81, 146.83, 196.0],
    waveform: 'triangle',
    gain: 0.055,
  },
  Level1: {
    bpm: 116,
    notes: [329.63, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63, 293.66],
    bass: [164.81, 196.0, 220.0, 146.83],
    waveform: 'triangle',
    gain: 0.065,
  },
  Level2: {
    bpm: 132,
    notes: [293.66, 349.23, 440.0, 466.16, 440.0, 349.23, 329.63, 261.63],
    bass: [146.83, 174.61, 130.81, 110.0],
    waveform: 'sawtooth',
    gain: 0.048,
  },
  Level3: {
    bpm: 150,
    notes: [392.0, 493.88, 587.33, 783.99, 659.25, 587.33, 493.88, 440.0],
    bass: [196.0, 146.83, 164.81, 196.0],
    waveform: 'square',
    gain: 0.042,
  },
  Podium: {
    bpm: 124,
    notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 523.25],
    bass: [261.63, 196.0, 220.0, 261.63],
    waveform: 'triangle',
    gain: 0.065,
  },
};

class WebAudioSoundService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private muted = false;
  private musicState: MusicState = 'Stopped';
  private isUrgent = false;
  private stepIndex = 0;
  private loopTimer: number | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.55;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playQuizOutcome(outcome: 'success' | 'fail') {
    if (outcome === 'success') {
      this.playSuccess();
    } else {
      this.playFail();
    }
  }

  public playSuccess() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.065);

      gain.gain.setValueAtTime(0.001, now + i * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.24, now + i * 0.065 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.065 + 0.28);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.065);
      osc.stop(now + i * 0.065 + 0.3);
    });
  }

  public playFail() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const now = ctx.currentTime;
    const notes = [246.94, 196.0];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;

      gain.gain.setValueAtTime(0.001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.24);
    });
  }

  public playBoxOpen() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playJump() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.11);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playEliminationNotice() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    [329.63, 293.66, 246.94].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.15, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.28);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.3);
    });
  }

  public playVictoryFanfare() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const fanfare = [523.25, 659.25, 783.99, 659.25, 1046.5];
    const times = [0, 0.11, 0.22, 0.34, 0.48];
    fanfare.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + times[i]);
      gain.gain.setValueAtTime(0.22, now + times[i]);
      gain.gain.exponentialRampToValueAtTime(0.001, now + times[i] + (i === 4 ? 0.6 : 0.22));
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + times[i]);
      osc.stop(now + times[i] + 0.65);
    });
  }

  public setMusicState(state: MusicState) {
    if (this.musicState === state) return;
    this.musicState = state;
    this.isUrgent = false;
    this.stepIndex = 0;

    if (this.loopTimer !== null) {
      window.clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    if (state !== 'Stopped') {
      this.scheduleNextBeat();
    }
  }

  public setUrgency(urgent: boolean) {
    this.isUrgent = urgent;
  }

  private scheduleNextBeat() {
    if (this.musicState === 'Stopped') return;
    const profile = TRACK_PROFILES[this.musicState];
    const bpm = this.isUrgent ? profile.bpm * 1.14 : profile.bpm;
    const stepMs = Math.round((60 / bpm / 2) * 1000);

    if (this.ctx && this.ctx.state === 'running' && this.bgmGain && !this.muted) {
      const now = this.ctx.currentTime;
      const noteFreq = profile.notes[this.stepIndex % profile.notes.length];
      const bassFreq = profile.bass[Math.floor(this.stepIndex / 2) % profile.bass.length];

      // Melodic voice
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = profile.waveform;
      osc.frequency.setValueAtTime(noteFreq, now);

      filter.type = 'lowpass';
      filter.frequency.value = this.musicState === 'Level3' ? 1900 : 1200;

      const noteLen = (stepMs / 1000) * 0.85;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(profile.gain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + noteLen);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + noteLen + 0.02);

      // Bass pulse on even beats
      if (this.stepIndex % 2 === 0) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        bassGain.gain.setValueAtTime(0.001, now);
        bassGain.gain.exponentialRampToValueAtTime(profile.gain * 1.2, now + 0.02);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + noteLen * 1.4);
        bassOsc.connect(bassGain);
        bassGain.connect(this.bgmGain);
        bassOsc.start(now);
        bassOsc.stop(now + noteLen * 1.5);
      }
    }

    this.stepIndex++;
    this.loopTimer = window.setTimeout(() => this.scheduleNextBeat(), stepMs);
  }

  public dispose() {
    this.setMusicState('Stopped');
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const soundService = new WebAudioSoundService();
