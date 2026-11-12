/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GAME_CONSTANTS, LEVEL_CONFIGS } from './game/config';
import { soundService } from './game/soundService';
import { ThreeArenaEngine } from './game/ThreeArenaEngine';
import {
  ActiveQuizSession,
  AvatarId,
  ChatMessage,
  GamePhase,
  QuestionBankMap,
  QuizFeedbackState,
  RadarSnapshot,
  ServerRoomSnapshot,
  UserRole,
} from './game/types';
import { LobbyOverlay } from './components/LobbyOverlay';
import { WaitingRoomOverlay } from './components/WaitingRoomOverlay';
import { AdminDashboard } from './components/AdminDashboard';
import { QuestionDraft, QuestionManagerModal } from './components/QuestionManagerModal';
import { GameHUD } from './components/GameHUD';
import { QuizModal } from './components/QuizModal';
import { EliminationModal } from './components/EliminationModal';
import { PodiumOverlay } from './components/PodiumOverlay';

const INITIAL_ROOM: ServerRoomSnapshot = {
  serverPhase: 'WaitingRoom',
  currentLevel: 1,
  timeLeft: LEVEL_CONFIGS[1].durationSeconds,
  players: [],
  adminConnectedCount: 0,
  eliminationSummary: null,
  topThree: [],
  openedBoxIds: [],
  questionCounts: { 1: 20, 2: 20, 3: 20 },
};

export default function App() {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ThreeArenaEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const transportRef = useRef<'ws' | 'http' | null>(null);
  const httpClientIdRef = useRef<string | null>(null);
  const httpMoveBusyRef = useRef(false);
  const lastHttpMoveAtRef = useRef(0);
  const startHttpPollRef = useRef<(() => void) | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('Bima Kelas 5A');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>('Rimbi');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNeedsReload, setAuthNeedsReload] = useState(false);

  const [room, setRoom] = useState<ServerRoomSnapshot>(INITIAL_ROOM);
  const [nearestBoxId, setNearestBoxId] = useState<string | null>(null);
  const [radar, setRadar] = useState<RadarSnapshot | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuizSession | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [feedback, setFeedback] = useState<QuizFeedbackState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const [adminQuestionBank, setAdminQuestionBank] = useState<QuestionBankMap | null>(null);
  const [showQuestionManager, setShowQuestionManager] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [questionStatus, setQuestionStatus] = useState<string | null>(null);

  const activeQuizRef = useRef<ActiveQuizSession | null>(null);
  activeQuizRef.current = activeQuiz;
  const nearestBoxRef = useRef<string | null>(null);
  nearestBoxRef.current = nearestBoxId;
  const cooldownRef = useRef(0);
  cooldownRef.current = cooldownSeconds;
  const roleRef = useRef<UserRole | null>(null);
  roleRef.current = role;

  const localPlayer = useMemo(
    () => (localPlayerId ? room.players.find((p) => p.id === localPlayerId) : undefined),
    [room.players, localPlayerId]
  );

  const effectivePhase: GamePhase = useMemo(() => {
    if (!role) return 'Login';
    if (room.serverPhase === 'WaitingRoom') return 'WaitingRoom';
    if (room.serverPhase === 'EliminationReport') return 'EliminationReport';
    if (room.serverPhase === 'Podium') return 'Podium';
    if (role === 'admin') return 'Playing';
    if (localPlayer?.status === 'Eliminated') return 'Spectator';
    return 'Playing';
  }, [role, room.serverPhase, localPlayer?.status]);

  const effectivePhaseRef = useRef<GamePhase>('Login');
  effectivePhaseRef.current = effectivePhase;

  const sortedPlayers = useMemo(() => {
    return [...room.players].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'Playing' ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      return b.correctCount - a.correctCount;
    });
  }, [room.players]);

  const showToast = useCallback((isCorrect: boolean, title: string, detail: string) => {
    const id = Date.now();
    setFeedback({ id, isCorrect, title, detail });
    window.setTimeout(() => {
      setFeedback((prev) => (prev && prev.id === id ? null : prev));
    }, 3400);
  }, []);

  const handleServerEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      switch (type) {
        case 'room:state': {
          setRoom(payload as unknown as ServerRoomSnapshot);
          break;
        }
        case 'room:timer': {
          const nextLeft = Number(payload.timeLeft) || 0;
          setRoom((prev) => ({ ...prev, timeLeft: nextLeft }));
          break;
        }
        case 'auth:accepted': {
          const acceptedRole = payload.role as UserRole;
          const pid = (payload.playerId as string | null) ?? null;
          setIsSubmitting(false);
          setIsConnected(true);
          setAuthError(null);
          setRole(acceptedRole);
          setLocalPlayerId(pid);
          break;
        }
        case 'auth:error': {
          setIsSubmitting(false);
          setAuthError(String(payload.message || 'Gagal masuk.'));
          break;
        }
        case 'player:moved': {
          engineRef.current?.updateRemotePlayer(
            payload as {
              id: string;
              x: number;
              y: number;
              z: number;
              yaw: number;
              moving: boolean;
              grounded: boolean;
            }
          );
          break;
        }
        case 'quiz:prompt': {
          setActiveQuiz({
            boxId: String(payload.boxId),
            question: payload.question as ActiveQuizSession['question'],
          });
          break;
        }
        case 'quiz:result': {
          const isCorrect = Boolean(payload.isCorrect);
          soundService.playQuizOutcome(isCorrect ? 'success' : 'fail');
          if (isCorrect) {
            const pts = Number(payload.points) || 0;
            showToast(true, `Benar! +${pts} Poin`, String(payload.explanation || ''));
          } else {
            const cd = Number(payload.cooldownSeconds) || GAME_CONSTANTS.WRONG_ANSWER_COOLDOWN_SECONDS;
            setCooldownSeconds(cd);
            showToast(false, 'Kurang Tepat', `Tunggu ${cd} detik sebelum membuka box lagi.`);
          }
          break;
        }
        case 'quiz:cooldown': {
          const rem = Number(payload.remaining) || 1;
          setCooldownSeconds(rem);
          soundService.playQuizOutcome('fail');
          showToast(false, 'Jeda Aktif', `Tunggu ${rem} detik lagi.`);
          break;
        }
        case 'quiz:error': {
          showToast(false, 'Box Sudah Diambil', String(payload.message || 'Coba Mystery Box lain.'));
          break;
        }
        case 'box:solved': {
          const boxId = String(payload.boxId || '');
          const respawnSeconds = Number(payload.respawnSeconds) || GAME_CONSTANTS.BOX_RESPAWN_SECONDS;
          if (boxId) {
            engineRef.current?.markBoxSolved(boxId, respawnSeconds);
          }
          break;
        }
        case 'admin:questions': {
          setAdminQuestionBank(payload.questionBank as QuestionBankMap);
          break;
        }
        case 'admin:question_saved': {
          setQuestionError(null);
          const msgText =
            payload.id === 'reset'
              ? 'Bank soal dikembalikan ke 60 soal bawaan.'
              : payload.isEdit
              ? 'Perubahan soal berhasil disimpan.'
              : 'Soal baru berhasil ditambahkan ke bank soal.';
          setQuestionStatus(msgText);
          window.setTimeout(() => {
            setQuestionStatus((prev) => (prev === msgText ? null : prev));
          }, 3000);
          break;
        }
        case 'admin:question_error': {
          setQuestionStatus(null);
          setQuestionError(String(payload.message || 'Gagal memperbarui soal.'));
          break;
        }
        case 'chat:history': {
          const list = Array.isArray(payload.messages) ? (payload.messages as ChatMessage[]) : [];
          setChatMessages(list);
          break;
        }
        case 'chat:message': {
          const incoming = payload.message as ChatMessage | undefined;
          if (!incoming || !incoming.id) return;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const next = [...prev, incoming];
            return next.length > 50 ? next.slice(next.length - 50) : next;
          });
          break;
        }
      }
    },
    [showToast]
  );

  const sendWs = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      if (transportRef.current === 'ws') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type, payload }));
          return;
        }
      }

      const clientId = httpClientIdRef.current;
      if (!clientId) return;

      if (type === 'player:move') {
        const now = performance.now();
        if (httpMoveBusyRef.current || now - lastHttpMoveAtRef.current < 180) {
          return;
        }
        httpMoveBusyRef.current = true;
        lastHttpMoveAtRef.current = now;
      }

      fetch('/api/client/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        redirect: 'manual',
        body: JSON.stringify({ clientId, type, payload }),
      })
        .then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
            setAuthNeedsReload(true);
            return;
          }
          if (!res.ok) {
            if (res.status === 404) {
              setIsConnected(false);
              setRole(null);
              setLocalPlayerId(null);
              httpClientIdRef.current = null;
              transportRef.current = null;
            }
            return;
          }
          if (!contentType.includes('application/json')) return;
          const data = (await res.json()) as {
            ok?: boolean;
            events?: Array<{ type: string; payload?: Record<string, unknown> }>;
            snapshot?: ServerRoomSnapshot;
          };
          if (data.snapshot) {
            setRoom(data.snapshot);
          }
          if (Array.isArray(data.events)) {
            for (const ev of data.events) {
              handleServerEvent(ev.type, ev.payload || {});
            }
          }
        })
        .catch(() => {
          // Ignore transient network errors; poll loop will reconcile
        })
        .finally(() => {
          if (type === 'player:move') {
            httpMoveBusyRef.current = false;
          }
        });
    },
    [handleServerEvent]
  );

  // Mount Three.js Arena Engine once inside isolated container (fail-safe if WebGL unavailable)
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    let engine: ThreeArenaEngine | null = null;
    try {
      engine = new ThreeArenaEngine(
        container,
        {
          onNearestBoxChange: (boxId) => {
            setNearestBoxId(boxId);
          },
          onLocalPlayerMove: (move) => {
            if (roleRef.current === 'student') {
              sendWs('player:move', move);
            }
          },
          onRadarUpdate: (snapshot) => {
            setRadar(snapshot);
          },
        },
        'Rimbi',
        'Bima Kelas 5A'
      );
      engineRef.current = engine;
    } catch (err) {
      console.error('3D Arena init fallback:', err);
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
      soundService.dispose();
    };
  }, [sendWs]);

  // Live preview of student name & avatar before logging in
  useEffect(() => {
    if (effectivePhase === 'Login') {
      engineRef.current?.setPlayerIdentity(playerName, selectedAvatar);
    }
  }, [playerName, selectedAvatar, effectivePhase]);

  // Persistent dual-transport connection: WebSocket primary + automatic HTTP fallback
  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer = 0;
    let pollTimer = 0;

    const scheduleHttpPoll = () => {
      window.clearTimeout(pollTimer);
      if (closedByCleanup || transportRef.current !== 'http' || !httpClientIdRef.current) return;

      const delay = roleRef.current ? 380 : 900;
      pollTimer = window.setTimeout(async () => {
        if (closedByCleanup || transportRef.current !== 'http' || !httpClientIdRef.current) return;
        try {
          const res = await fetch(
            `/api/client/poll?clientId=${encodeURIComponent(httpClientIdRef.current)}`,
            { credentials: 'same-origin', redirect: 'manual' }
          );
          const contentType = res.headers.get('content-type') || '';
          if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
            setAuthNeedsReload(true);
            return;
          }
          if (!res.ok || !contentType.includes('application/json')) {
            throw new Error('HTTP poll failed');
          }
          const data = (await res.json()) as {
            ok?: boolean;
            expired?: boolean;
            events?: Array<{ type: string; payload?: Record<string, unknown> }>;
            snapshot?: ServerRoomSnapshot;
          };
          if (closedByCleanup) return;

          if (data.expired) {
            httpClientIdRef.current = null;
            transportRef.current = null;
            setIsConnected(false);
            setRole(null);
            setLocalPlayerId(null);
            connectHttp();
            return;
          }

          if (data.snapshot) {
            setRoom(data.snapshot);
          }
          if (Array.isArray(data.events)) {
            for (const ev of data.events) {
              handleServerEvent(ev.type, ev.payload || {});
            }
          }
        } catch {
          // Retry on next tick or reconnect if needed
        }
        scheduleHttpPoll();
      }, delay);
    };

    const isWsActive = () => transportRef.current === 'ws';
    startHttpPollRef.current = scheduleHttpPoll;

    const connectHttp = async () => {
      if (closedByCleanup || isWsActive()) return;
      if (httpClientIdRef.current) {
        transportRef.current = 'http';
        setIsConnected(true);
        scheduleHttpPoll();
        return;
      }
      try {
        const res = await fetch('/api/client/connect', {
          method: 'POST',
          credentials: 'same-origin',
          redirect: 'manual',
        });
        if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
          setAuthNeedsReload(true);
          return;
        }
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          throw new Error('HTTP connect failed');
        }
        const data = (await res.json()) as {
          ok?: boolean;
          clientId?: string;
          snapshot?: ServerRoomSnapshot;
        };
        if (closedByCleanup || isWsActive() || !data.clientId) return;

        if (!httpClientIdRef.current) {
          httpClientIdRef.current = data.clientId;
        }
        transportRef.current = 'http';
        setAuthNeedsReload(false);
        if (data.snapshot) setRoom(data.snapshot);
        setIsConnected(true);
        scheduleHttpPoll();
      } catch {
        if (!closedByCleanup && transportRef.current === null) {
          reconnectTimer = window.setTimeout(connectHttp, 1500);
        }
      }
    };

    const connectWs = () => {
      if (closedByCleanup) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (closedByCleanup) {
            ws.close();
            return;
          }
          // If the user hasn't started an active HTTP session yet, upgrade seamlessly to WebSocket
          if (!roleRef.current) {
            transportRef.current = 'ws';
            httpClientIdRef.current = null;
            window.clearTimeout(pollTimer);
            setIsConnected(true);
          } else {
            // Keep active HTTP session intact without interrupting logged-in user
            ws.close();
          }
        };

        ws.onmessage = (event) => {
          let msg: { type: string; payload?: Record<string, unknown> };
          try {
            msg = JSON.parse(String(event.data));
          } catch {
            return;
          }
          handleServerEvent(msg.type, msg.payload || {});
        };

        ws.onclose = () => {
          if (closedByCleanup) return;
          if (transportRef.current === 'ws') {
            transportRef.current = null;
            setIsConnected(false);
            setRole(null);
            setLocalPlayerId(null);
            setActiveQuiz(null);
            setAdminQuestionBank(null);
            setShowQuestionManager(false);
            setChatMessages([]);
            reconnectTimer = window.setTimeout(() => {
              connectWs();
              connectHttp();
            }, 1200);
          }
        };
      } catch {
        // WebSocket unavailable in this environment; HTTP fallback handles connectivity
      }
    };

    connectWs();
    connectHttp();

    return () => {
      closedByCleanup = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(pollTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [handleServerEvent]);

  // Sync 3D level geometry & music on phase / level transitions
  useEffect(() => {
    if (effectivePhase === 'Login') {
      soundService.setMusicState('Lobby');
      return;
    }

    if (effectivePhase === 'WaitingRoom') {
      setActiveQuiz(null);
      setCooldownSeconds(0);
      setNearestBoxId(null);
      engineRef.current?.loadLevel(1);
      soundService.setMusicState('Lobby');
      return;
    }

    if (effectivePhase === 'Playing' || effectivePhase === 'Spectator') {
      setActiveQuiz(null);
      setCooldownSeconds(0);
      setNearestBoxId(null);
      engineRef.current?.loadLevel(room.currentLevel);
      soundService.setMusicState(
        room.currentLevel === 1 ? 'Level1' : room.currentLevel === 2 ? 'Level2' : 'Level3'
      );
      return;
    }

    if (effectivePhase === 'EliminationReport') {
      setActiveQuiz(null);
      soundService.playEliminationNotice();
      return;
    }

    if (effectivePhase === 'Podium') {
      setActiveQuiz(null);
      engineRef.current?.showPodium(room.topThree, localPlayerId);
      soundService.setMusicState('Podium');
      soundService.playVictoryFanfare();
    }
  }, [effectivePhase, room.currentLevel, room.topThree, localPlayerId]);

  // Idempotent sync of real connected players & opened boxes
  useEffect(() => {
    engineRef.current?.syncRoster(
      room.players,
      effectivePhase,
      localPlayerId,
      role === 'admin'
    );
    engineRef.current?.syncOpenedBoxes(room.openedBoxIds);
  }, [room.players, room.openedBoxIds, effectivePhase, localPlayerId, role]);

  // Music urgency cue when <= 30s remain
  useEffect(() => {
    soundService.setUrgency(
      effectivePhase === 'Playing' && room.timeLeft > 0 && room.timeLeft <= 30
    );
  }, [room.timeLeft, effectivePhase]);

  // Pause local movement during QuizModal or non-walking phases
  useEffect(() => {
    const canWalk =
      role === 'student' &&
      !activeQuiz &&
      (effectivePhase === 'Playing' || effectivePhase === 'WaitingRoom');
    engineRef.current?.setInputPaused(!canWalk);
  }, [role, activeQuiz, effectivePhase]);

  const openMysteryBox = useCallback(
    (boxId: string) => {
      if (roleRef.current !== 'student' || effectivePhaseRef.current !== 'Playing') return;
      if (activeQuizRef.current) return;
      if (cooldownRef.current > 0) {
        soundService.playQuizOutcome('fail');
        showToast(false, 'Jeda Aktif', `Tunggu ${cooldownRef.current} detik lagi.`);
        return;
      }
      soundService.unlock();
      soundService.playBoxOpen();
      sendWs('box:open', { boxId });
    },
    [sendWs, showToast]
  );

  // Keyboard 'E' interaction for Mystery Box
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (
        e.code === 'KeyE' &&
        nearestBoxRef.current &&
        roleRef.current === 'student' &&
        effectivePhaseRef.current === 'Playing' &&
        !activeQuizRef.current
      ) {
        e.preventDefault();
        openMysteryBox(nearestBoxRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openMysteryBox]);

  // Cooldown countdown tick
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = window.setTimeout(() => setCooldownSeconds((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldownSeconds]);

  const handleSubmitAnswer = useCallback(
    (chosenIndex: number) => {
      if (!activeQuizRef.current) return;
      setActiveQuiz(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      sendWs('quiz:submit', { chosenIndex });
    },
    [sendWs]
  );

  const submitAuthWithFallback = async (
    type: 'auth:login_student' | 'auth:login_admin',
    payload: Record<string, unknown>
  ) => {
    setIsSubmitting(true);
    setAuthError(null);
    setAuthNeedsReload(false);

    if (transportRef.current === 'ws' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
      window.setTimeout(() => setIsSubmitting(false), 3000);
      return;
    }

    try {
      let lastIssue: 'warmup' | 'network' | string = 'network';

      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => window.setTimeout(r, 750));
          if (transportRef.current === 'ws' && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type, payload }));
            window.setTimeout(() => setIsSubmitting(false), 3000);
            return;
          }
        }

        const res = await fetch('/api/client/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          redirect: 'manual',
          body: JSON.stringify({
            clientId: httpClientIdRef.current || '',
            type,
            payload,
          }),
        });

        if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
          setAuthNeedsReload(true);
          setAuthError(
            'Sesi akses preview perlu disegarkan atau cookie browser diblokir. Klik "Muat Ulang Halaman" atau buka aplikasi di tab baru.'
          );
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504 ||
          contentType.includes('text/html')
        ) {
          lastIssue = 'warmup';
          continue;
        }

        if (!res.ok) {
          lastIssue = `HTTP ${res.status}`;
          throw new Error(lastIssue);
        }

        const data = (await res.json()) as {
          ok?: boolean;
          clientId?: string;
          events?: Array<{ type: string; payload?: Record<string, unknown> }>;
          snapshot?: ServerRoomSnapshot;
        };

        if (data.clientId) {
          httpClientIdRef.current = data.clientId;
          transportRef.current = 'http';
          setIsConnected(true);
          startHttpPollRef.current?.();
        }
        if (data.snapshot) {
          setRoom(data.snapshot);
        }
        if (Array.isArray(data.events)) {
          for (const ev of data.events) {
            handleServerEvent(ev.type, ev.payload || {});
          }
        }
        return;
      }

      if (lastIssue === 'warmup') {
        setAuthNeedsReload(true);
        setAuthError(
          'Server masih sedang memulai ulang. Tunggu beberapa detik lalu klik lagi atau muat ulang halaman.'
        );
      } else {
        setAuthNeedsReload(true);
        setAuthError('Belum berhasil terhubung ke server. Muat ulang halaman atau buka di tab baru.');
      }
    } catch (err) {
      setAuthNeedsReload(true);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setAuthError('Perangkat sedang offline. Periksa koneksi internet Anda lalu coba lagi.');
      } else {
        const detail = err instanceof Error && err.message.startsWith('HTTP ') ? ` (${err.message})` : '';
        setAuthError(
          `Belum berhasil terhubung ke server${detail}. Klik "Muat Ulang Halaman" atau buka aplikasi di tab baru.`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginStudent = () => {
    soundService.unlock();
    engineRef.current?.setPlayerIdentity(playerName, selectedAvatar);
    void submitAuthWithFallback('auth:login_student', {
      name: playerName,
      avatarId: selectedAvatar,
    });
  };

  const handleLoginAdmin = (pin: string) => {
    soundService.unlock();
    void submitAuthWithFallback('auth:login_admin', { pin });
  };

  const handleLogout = () => {
    sendWs('auth:logout');
    setRole(null);
    setLocalPlayerId(null);
    setActiveQuiz(null);
    setAuthError(null);
    setAdminQuestionBank(null);
    setShowQuestionManager(false);
    setChatMessages([]);
    engineRef.current?.loadLevel(1);
    soundService.setMusicState('Lobby');
  };

  const handleSendChatMessage = useCallback(
    (text: string) => {
      sendWs('chat:send', { text });
    },
    [sendWs]
  );

  const handleToggleMute = () => {
    soundService.unlock();
    const next = !isMuted;
    setIsMuted(next);
    soundService.setMuted(next);
  };

  const handleJump = () => {
    soundService.unlock();
    soundService.playJump();
    engineRef.current?.triggerJump();
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasContainerRef} className="w-full h-full" />

      {effectivePhase === 'Login' && (
        <LobbyOverlay
          playerName={playerName}
          onNameChange={setPlayerName}
          selectedAvatar={selectedAvatar}
          onSelectAvatar={setSelectedAvatar}
          onLoginStudent={handleLoginStudent}
          onLoginAdmin={handleLoginAdmin}
          waitingCount={room.players.length}
          isConnected={isConnected}
          isSubmitting={isSubmitting}
          authError={authError}
          authNeedsReload={authNeedsReload}
          onClearAuthError={() => {
            setAuthError(null);
            setAuthNeedsReload(false);
          }}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {role === 'admin' && (
        <AdminDashboard
          room={room}
          sortedPlayers={sortedPlayers}
          chatMessages={chatMessages}
          onSendMessage={handleSendChatMessage}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onStartGame={() => {
            soundService.unlock();
            sendWs('admin:start_game');
          }}
          onEndRound={() => sendWs('admin:end_round')}
          onNextLevel={() => sendWs('admin:next_level')}
          onResetLobby={() => sendWs('admin:reset_lobby')}
          onOpenQuestionManager={() => {
            setQuestionError(null);
            setQuestionStatus(null);
            sendWs('admin:get_questions');
            setShowQuestionManager(true);
          }}
          onLogout={handleLogout}
        />
      )}

      {role === 'admin' && showQuestionManager && adminQuestionBank && (
        <QuestionManagerModal
          questionBank={adminQuestionBank}
          errorMessage={questionError}
          statusMessage={questionStatus}
          onClearMessages={() => {
            setQuestionError(null);
            setQuestionStatus(null);
          }}
          onSaveQuestion={(draft: QuestionDraft) => {
            sendWs('admin:save_question', { question: draft });
          }}
          onDeleteQuestion={(id, level) => {
            sendWs('admin:delete_question', { id, level });
          }}
          onResetQuestions={() => {
            sendWs('admin:reset_questions');
          }}
          onClose={() => {
            setShowQuestionManager(false);
            setQuestionError(null);
            setQuestionStatus(null);
          }}
        />
      )}

      {role === 'student' && effectivePhase === 'WaitingRoom' && (
        <WaitingRoomOverlay
          players={room.players}
          localPlayerId={localPlayerId}
          adminConnectedCount={room.adminConnectedCount}
          chatMessages={chatMessages}
          onSendMessage={handleSendChatMessage}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onTouchMove={(dx, dz) => engineRef.current?.setTouchInput(dx, dz)}
          onJump={handleJump}
          onLogout={handleLogout}
        />
      )}

      {role === 'student' && (effectivePhase === 'Playing' || effectivePhase === 'Spectator') && (
        <GameHUD
          levelConfig={LEVEL_CONFIGS[room.currentLevel]}
          timeLeft={room.timeLeft}
          isSpectator={effectivePhase === 'Spectator'}
          localPlayer={localPlayer}
          sortedPlayers={sortedPlayers}
          nearestBoxId={nearestBoxId}
          radar={radar}
          cooldownSeconds={cooldownSeconds}
          feedback={feedback}
          chatMessages={chatMessages}
          onSendMessage={handleSendChatMessage}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenNearestBox={() => nearestBoxId && openMysteryBox(nearestBoxId)}
          onTouchMove={(dx, dz) => engineRef.current?.setTouchInput(dx, dz)}
          onJump={handleJump}
          onLogout={handleLogout}
        />
      )}

      {role === 'student' && activeQuiz && (
        <QuizModal session={activeQuiz} onSubmitAnswer={handleSubmitAnswer} />
      )}

      {role === 'student' && effectivePhase === 'EliminationReport' && room.eliminationSummary && (
        <EliminationModal
          summary={room.eliminationSummary}
          localPlayerId={localPlayerId}
        />
      )}

      {role !== null && effectivePhase === 'Podium' && (
        <PodiumOverlay
          topThree={room.topThree}
          localPlayer={localPlayer}
          isAdmin={role === 'admin'}
          onResetLobby={() => sendWs('admin:reset_lobby')}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
