import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GAME_CONSTANTS, LEVEL_CONFIGS } from './src/game/config.ts';
import { QUESTION_BANK } from './src/game/questionBank.ts';
import type {
  AvatarId,
  ChatMessage,
  ClientQuizQuestion,
  EliminationSummary,
  PlayerRecord,
  QuestionBankMap,
  QuestionSubject,
  QuizQuestion,
  ServerRoomSnapshot,
} from './src/game/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_PIN = (process.env.ADMIN_PIN || GAME_CONSTANTS.DEFAULT_ADMIN_PIN).trim().toUpperCase();
const PORT = Number(process.env.PORT) || 3000;
const QUESTION_STORE_PATH = path.resolve(__dirname, 'data', 'question-bank.json');
const VALID_SUBJECTS: QuestionSubject[] = ['Matematika', 'Bahasa Indonesia', 'IPA', 'PPKn', 'IPS'];

interface ClientEvent {
  type: string;
  payload: unknown;
}

interface ClientConnection {
  id: string;
  transport: 'ws' | 'http';
  ws?: WebSocket;
  queue: ClientEvent[];
  lastSeenAt: number;
}

interface ServerPlayer {
  id: string;
  clientId: string;
  name: string;
  avatarId: AvatarId;
  score: number;
  status: 'Playing' | 'Eliminated';
  correctCount: number;
  eliminatedAtLevel?: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  moving: boolean;
  grounded: boolean;
  answeredQuestionIds: Set<string>;
  activeSession: { boxId: string; question: QuizQuestion } | null;
  cooldownUntil: number;
}

let serverPhase: 'WaitingRoom' | 'Playing' | 'EliminationReport' | 'Podium' = 'WaitingRoom';
let currentLevel: 1 | 2 | 3 = 1;
let timeLeft = LEVEL_CONFIGS[1].durationSeconds;
let eliminationSummary: EliminationSummary | null = null;
let topThree: PlayerRecord[] = [];

const clients = new Map<string, ClientConnection>();
const players = new Map<string, ServerPlayer>();
const adminClientIds = new Set<string>();
const clientToPlayerId = new Map<string, string>();
const boxOpenedUntil = new Map<string, number>();
const chatHistory: ChatMessage[] = [];
const lastChatAtByClient = new Map<string, number>();

function cloneDefaultQuestionBank(): QuestionBankMap {
  return {
    1: QUESTION_BANK[1].map((q) => ({ ...q, options: [...q.options] as [string, string, string, string] })),
    2: QUESTION_BANK[2].map((q) => ({ ...q, options: [...q.options] as [string, string, string, string] })),
    3: QUESTION_BANK[3].map((q) => ({ ...q, options: [...q.options] as [string, string, string, string] })),
  };
}

function loadQuestionBank(): QuestionBankMap {
  try {
    if (fs.existsSync(QUESTION_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(QUESTION_STORE_PATH, 'utf-8')) as Partial<QuestionBankMap>;
      if (
        Array.isArray(parsed[1]) &&
        parsed[1].length > 0 &&
        Array.isArray(parsed[2]) &&
        parsed[2].length > 0 &&
        Array.isArray(parsed[3]) &&
        parsed[3].length > 0
      ) {
        return {
          1: parsed[1],
          2: parsed[2],
          3: parsed[3],
        };
      }
    }
  } catch (err) {
    console.warn('Could not load saved question bank, falling back to defaults:', err);
  }
  return cloneDefaultQuestionBank();
}

function persistQuestionBank(bank: QuestionBankMap) {
  try {
    fs.mkdirSync(path.dirname(QUESTION_STORE_PATH), { recursive: true });
    fs.writeFileSync(QUESTION_STORE_PATH, JSON.stringify(bank, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist question bank:', err);
  }
}

let questionBank: QuestionBankMap = loadQuestionBank();

function toPublicPlayer(p: ServerPlayer): PlayerRecord {
  return {
    id: p.id,
    name: p.name,
    avatarId: p.avatarId,
    score: p.score,
    status: p.status,
    correctCount: p.correctCount,
    eliminatedAtLevel: p.eliminatedAtLevel,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    moving: p.moving,
    grounded: p.grounded,
  };
}

function getOpenedBoxIds(): string[] {
  const now = Date.now();
  const opened: string[] = [];
  for (const [boxId, until] of boxOpenedUntil.entries()) {
    if (now < until) {
      opened.push(boxId);
    } else {
      boxOpenedUntil.delete(boxId);
    }
  }
  return opened;
}

function buildSnapshot(): ServerRoomSnapshot {
  return {
    serverPhase,
    currentLevel,
    timeLeft,
    players: Array.from(players.values()).map(toPublicPlayer),
    adminConnectedCount: adminClientIds.size,
    eliminationSummary,
    topThree,
    openedBoxIds: getOpenedBoxIds(),
    questionCounts: {
      1: questionBank[1].length,
      2: questionBank[2].length,
      3: questionBank[3].length,
    },
  };
}

function sendToClient(clientId: string, type: string, payload: unknown) {
  const client = clients.get(clientId);
  if (!client) return;

  if (client.transport === 'ws' && client.ws && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify({ type, payload }));
    return;
  }

  if (client.transport === 'http') {
    client.queue.push({ type, payload });
    if (client.queue.length > 120) {
      client.queue.splice(0, client.queue.length - 120);
    }
  }
}

function drainClientQueue(clientId: string): ClientEvent[] {
  const client = clients.get(clientId);
  if (!client || client.queue.length === 0) return [];
  const drained = client.queue.slice();
  client.queue.length = 0;
  return drained;
}

function broadcastAdmins(type: string, payload: unknown) {
  for (const adminClientId of adminClientIds) {
    sendToClient(adminClientId, type, payload);
  }
}

function broadcastAll(type: string, payload: unknown, exceptClientId?: string) {
  // Send to every connected WS client (including those in login view) and every HTTP active player/admin
  for (const client of clients.values()) {
    if (client.id === exceptClientId) continue;
    if (client.transport === 'ws') {
      sendToClient(client.id, type, payload);
    } else if (
      clientToPlayerId.has(client.id) ||
      adminClientIds.has(client.id) ||
      type === 'room:state'
    ) {
      // Avoid queuing noisy room:timer / player:moved for unauthenticated HTTP idle tabs
      if (type === 'room:timer' && !clientToPlayerId.has(client.id) && !adminClientIds.has(client.id)) {
        continue;
      }
      sendToClient(client.id, type, payload);
    }
  }
}

function broadcastRoomState() {
  broadcastAll('room:state', buildSnapshot());
}

function disconnectClient(clientId: string) {
  clients.delete(clientId);
  lastChatAtByClient.delete(clientId);

  let changed = false;
  const pid = clientToPlayerId.get(clientId);
  if (pid) {
    players.delete(pid);
    clientToPlayerId.delete(clientId);
    changed = true;
  }
  if (adminClientIds.delete(clientId)) {
    changed = true;
  }
  if (changed) {
    broadcastRoomState();
  }
}

function pickUniqueQuestionForPlayer(player: ServerPlayer, level: 1 | 2 | 3): QuizQuestion {
  const bank = questionBank[level];
  const unseen = bank.filter((q) => !player.answeredQuestionIds.has(q.id));
  const pool = unseen.length > 0 ? unseen : bank;
  if (unseen.length === 0) {
    for (const q of bank) {
      player.answeredQuestionIds.delete(q.id);
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function stripAnswer(q: QuizQuestion): ClientQuizQuestion {
  return {
    id: q.id,
    level: q.level,
    subject: q.subject,
    cognitiveTag: q.cognitiveTag,
    question: q.question,
    options: q.options,
  };
}

function concludeLevel() {
  if (serverPhase !== 'Playing') return;

  for (const p of players.values()) {
    p.activeSession = null;
  }
  boxOpenedUntil.clear();

  if (currentLevel === 1 || currentLevel === 2) {
    const active = Array.from(players.values()).filter((p) => p.status === 'Playing');
    const ascending = [...active].sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.correctCount - b.correctCount;
    });

    const maxPossible = Math.max(0, active.length - GAME_CONSTANTS.MIN_SURVIVORS_FOR_PODIUM);
    const targetElim = Math.min(
      Math.max(GAME_CONSTANTS.ELIMINATION_MIN, Math.floor(active.length * 0.4)),
      GAME_CONSTANTS.ELIMINATION_MAX
    );
    const elimCount = Math.min(targetElim, maxPossible);
    const eliminatedList = ascending.slice(0, elimCount);

    for (const elim of eliminatedList) {
      elim.status = 'Eliminated';
      elim.eliminatedAtLevel = currentLevel;
    }

    eliminationSummary = {
      completedLevel: currentLevel,
      nextLevel: (currentLevel + 1) as 2 | 3,
      eliminatedPlayers: eliminatedList.map(toPublicPlayer),
      survivorCount: active.length - elimCount,
    };
    serverPhase = 'EliminationReport';
    broadcastRoomState();
  } else {
    const ranked = Array.from(players.values()).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Playing' ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return b.correctCount - a.correctCount;
    });
    topThree = ranked.slice(0, 3).map(toPublicPlayer);
    serverPhase = 'Podium';
    broadcastRoomState();
  }
}

function handleClientMessage(clientId: string, type: string, payload: Record<string, unknown>) {
  const client = clients.get(clientId);
  if (!client) return;
  client.lastSeenAt = Date.now();

  switch (type) {
    case 'auth:login_student': {
      const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
      const cleanName = (rawName || 'Penjelajah Cilik').slice(0, 20);
      const avatar = (typeof payload.avatarId === 'string' ? payload.avatarId : 'Rimbi') as AvatarId;
      const validAvatar: AvatarId = ['Rimbi', 'Samudra', 'Surya', 'Kirana'].includes(avatar)
        ? avatar
        : 'Rimbi';

      const existingId = clientToPlayerId.get(clientId);
      if (existingId && players.has(existingId)) {
        const p = players.get(existingId)!;
        p.name = cleanName;
        p.avatarId = validAvatar;
        sendToClient(clientId, 'auth:accepted', { role: 'student', playerId: p.id });
        sendToClient(clientId, 'chat:history', { messages: chatHistory });
        broadcastRoomState();
        return;
      }

      adminClientIds.delete(clientId);
      const id = `plr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const angle = Math.random() * Math.PI * 2;
      const spawnR = 3 + Math.random() * 3;
      const newPlayer: ServerPlayer = {
        id,
        clientId,
        name: cleanName,
        avatarId: validAvatar,
        score: 0,
        status: serverPhase === 'WaitingRoom' ? 'Playing' : 'Eliminated',
        correctCount: 0,
        x: Math.cos(angle) * spawnR,
        y: 0,
        z: serverPhase === 'WaitingRoom' ? Math.sin(angle) * spawnR : 14,
        yaw: Math.PI,
        moving: false,
        grounded: true,
        answeredQuestionIds: new Set<string>(),
        activeSession: null,
        cooldownUntil: 0,
      };
      players.set(id, newPlayer);
      clientToPlayerId.set(clientId, id);

      sendToClient(clientId, 'auth:accepted', { role: 'student', playerId: id });
      sendToClient(clientId, 'chat:history', { messages: chatHistory });
      broadcastRoomState();
      break;
    }

    case 'auth:login_admin': {
      const pin = typeof payload.pin === 'string' ? payload.pin.trim().toUpperCase() : '';
      if (pin !== ADMIN_PIN) {
        sendToClient(clientId, 'auth:error', {
          message: 'Kode Admin salah. Gunakan kode guru yang benar.',
        });
        return;
      }

      const oldId = clientToPlayerId.get(clientId);
      if (oldId) {
        players.delete(oldId);
        clientToPlayerId.delete(clientId);
      }

      adminClientIds.add(clientId);
      sendToClient(clientId, 'auth:accepted', { role: 'admin', playerId: null });
      sendToClient(clientId, 'admin:questions', { questionBank });
      sendToClient(clientId, 'chat:history', { messages: chatHistory });
      broadcastRoomState();
      break;
    }

    case 'auth:logout': {
      const pid = clientToPlayerId.get(clientId);
      if (pid) {
        players.delete(pid);
        clientToPlayerId.delete(clientId);
      }
      adminClientIds.delete(clientId);
      broadcastRoomState();
      break;
    }

    case 'player:move': {
      const pid = clientToPlayerId.get(clientId);
      if (!pid) return;
      const p = players.get(pid);
      if (!p) return;

      p.x = Number(payload.x) || 0;
      p.y = Number(payload.y) || 0;
      p.z = Number(payload.z) || 0;
      p.yaw = Number(payload.yaw) || 0;
      p.moving = Boolean(payload.moving);
      p.grounded = payload.grounded !== false;

      broadcastAll(
        'player:moved',
        {
          id: p.id,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          moving: p.moving,
          grounded: p.grounded,
        },
        clientId
      );
      break;
    }

    case 'box:open': {
      const pid = clientToPlayerId.get(clientId);
      if (!pid || serverPhase !== 'Playing') return;
      const p = players.get(pid);
      if (!p || p.status !== 'Playing') return;

      const boxId = typeof payload.boxId === 'string' ? payload.boxId : '';
      if (!boxId) return;

      const now = Date.now();
      if (now < p.cooldownUntil) {
        const remaining = Math.ceil((p.cooldownUntil - now) / 1000);
        sendToClient(clientId, 'quiz:cooldown', { remaining });
        return;
      }

      const boxUntil = boxOpenedUntil.get(boxId) || 0;
      if (now < boxUntil) {
        sendToClient(clientId, 'quiz:error', {
          message: 'Mystery Box baru saja dibuka penjelajah lain!',
        });
        return;
      }

      const question = pickUniqueQuestionForPlayer(p, currentLevel);
      p.activeSession = { boxId, question };

      sendToClient(clientId, 'quiz:prompt', {
        boxId,
        question: stripAnswer(question),
      });
      break;
    }

    case 'quiz:submit': {
      const pid = clientToPlayerId.get(clientId);
      if (!pid || serverPhase !== 'Playing') return;
      const p = players.get(pid);
      if (!p || !p.activeSession) return;

      const chosenIndex = Number(payload.chosenIndex);
      const session = p.activeSession;
      p.activeSession = null;

      p.answeredQuestionIds.add(session.question.id);

      const isCorrect = chosenIndex === session.question.correctIndex;
      if (isCorrect) {
        const pts = LEVEL_CONFIGS[currentLevel].pointsPerCorrect;
        p.score += pts;
        p.correctCount += 1;

        boxOpenedUntil.set(
          session.boxId,
          Date.now() + GAME_CONSTANTS.BOX_RESPAWN_SECONDS * 1000
        );

        sendToClient(clientId, 'quiz:result', {
          isCorrect: true,
          points: pts,
          explanation: session.question.explanation,
        });
        broadcastAll('box:solved', {
          boxId: session.boxId,
          solverId: p.id,
          respawnSeconds: GAME_CONSTANTS.BOX_RESPAWN_SECONDS,
        });
        broadcastRoomState();
      } else {
        p.cooldownUntil =
          Date.now() + GAME_CONSTANTS.WRONG_ANSWER_COOLDOWN_SECONDS * 1000;
        sendToClient(clientId, 'quiz:result', {
          isCorrect: false,
          points: 0,
          cooldownSeconds: GAME_CONSTANTS.WRONG_ANSWER_COOLDOWN_SECONDS,
          explanation: session.question.explanation,
        });
      }
      break;
    }

    case 'admin:start_game': {
      if (!adminClientIds.has(clientId)) return;
      if (players.size < 1) {
        sendToClient(clientId, 'auth:error', {
          message: 'Belum ada siswa yang masuk ke Ruang Tunggu.',
        });
        return;
      }

      currentLevel = 1;
      timeLeft = LEVEL_CONFIGS[1].durationSeconds;
      eliminationSummary = null;
      topThree = [];
      boxOpenedUntil.clear();

      for (const p of players.values()) {
        p.score = 0;
        p.correctCount = 0;
        p.status = 'Playing';
        p.eliminatedAtLevel = undefined;
        p.answeredQuestionIds.clear();
        p.activeSession = null;
        p.cooldownUntil = 0;
        p.x = (Math.random() - 0.5) * 6;
        p.y = 0;
        p.z = 14 + (Math.random() - 0.5) * 3;
      }

      serverPhase = 'Playing';
      broadcastRoomState();
      break;
    }

    case 'admin:end_round': {
      if (!adminClientIds.has(clientId)) return;
      concludeLevel();
      break;
    }

    case 'admin:next_level': {
      if (!adminClientIds.has(clientId) || !eliminationSummary) return;
      currentLevel = eliminationSummary.nextLevel;
      timeLeft = LEVEL_CONFIGS[currentLevel].durationSeconds;
      eliminationSummary = null;
      boxOpenedUntil.clear();

      for (const p of players.values()) {
        p.activeSession = null;
        p.cooldownUntil = 0;
        if (p.status === 'Playing') {
          p.x = (Math.random() - 0.5) * 6;
          p.y = 0;
          p.z = 14 + (Math.random() - 0.5) * 3;
        }
      }

      serverPhase = 'Playing';
      broadcastRoomState();
      break;
    }

    case 'admin:reset_lobby': {
      if (!adminClientIds.has(clientId)) return;
      serverPhase = 'WaitingRoom';
      currentLevel = 1;
      timeLeft = LEVEL_CONFIGS[1].durationSeconds;
      eliminationSummary = null;
      topThree = [];
      boxOpenedUntil.clear();

      for (const p of players.values()) {
        p.score = 0;
        p.correctCount = 0;
        p.status = 'Playing';
        p.eliminatedAtLevel = undefined;
        p.answeredQuestionIds.clear();
        p.activeSession = null;
        p.cooldownUntil = 0;
        const ang = Math.random() * Math.PI * 2;
        p.x = Math.cos(ang) * 4;
        p.y = 0;
        p.z = Math.sin(ang) * 4;
      }

      broadcastRoomState();
      break;
    }

    case 'admin:get_questions': {
      if (!adminClientIds.has(clientId)) return;
      sendToClient(clientId, 'admin:questions', { questionBank });
      break;
    }

    case 'admin:save_question': {
      if (!adminClientIds.has(clientId)) return;
      const rawQ = (payload.question || {}) as Partial<QuizQuestion>;
      const levelNum = Number(rawQ.level);
      const targetLevel: 1 | 2 | 3 = levelNum === 2 ? 2 : levelNum === 3 ? 3 : 1;
      const subject: QuestionSubject = VALID_SUBJECTS.includes(rawQ.subject as QuestionSubject)
        ? (rawQ.subject as QuestionSubject)
        : 'Matematika';
      const questionText = typeof rawQ.question === 'string' ? rawQ.question.trim() : '';
      const cognitiveTag =
        typeof rawQ.cognitiveTag === 'string' && rawQ.cognitiveTag.trim()
          ? rawQ.cognitiveTag.trim()
          : targetLevel === 1
          ? 'C1 · Mengingat'
          : targetLevel === 2
          ? 'C3 · Menerapkan'
          : 'C4 · Menganalisis';
      const explanation =
        typeof rawQ.explanation === 'string' && rawQ.explanation.trim()
          ? rawQ.explanation.trim()
          : 'Jawaban telah diperiksa oleh guru.';

      const optsRaw = Array.isArray(rawQ.options) ? rawQ.options : [];
      const cleanOpts = [0, 1, 2, 3].map((i) =>
        typeof optsRaw[i] === 'string' ? optsRaw[i].trim() : ''
      ) as [string, string, string, string];

      if (!questionText || cleanOpts.some((o) => !o)) {
        sendToClient(clientId, 'admin:question_error', {
          message: 'Pertanyaan dan keempat pilihan jawaban (A–D) wajib diisi.',
        });
        return;
      }

      const correctIdx = Number(rawQ.correctIndex);
      const validCorrectIndex =
        Number.isInteger(correctIdx) && correctIdx >= 0 && correctIdx <= 3 ? correctIdx : 0;

      const incomingId = typeof rawQ.id === 'string' && rawQ.id.trim() ? rawQ.id.trim() : '';
      let finalId = incomingId;
      let isEdit = false;

      if (incomingId) {
        for (const lvl of [1, 2, 3] as const) {
          const idx = questionBank[lvl].findIndex((q) => q.id === incomingId);
          if (idx !== -1) {
            isEdit = true;
            if (lvl === targetLevel) {
              questionBank[lvl][idx] = {
                id: incomingId,
                level: targetLevel,
                subject,
                cognitiveTag,
                question: questionText,
                options: cleanOpts,
                correctIndex: validCorrectIndex,
                explanation,
              };
            } else {
              if (questionBank[lvl].length <= 1) {
                sendToClient(clientId, 'admin:question_error', {
                  message: `Level ${lvl} minimal harus memiliki 1 soal tersisa sebelum soal ini dipindahkan.`,
                });
                return;
              }
              questionBank[lvl].splice(idx, 1);
              questionBank[targetLevel].unshift({
                id: incomingId,
                level: targetLevel,
                subject,
                cognitiveTag,
                question: questionText,
                options: cleanOpts,
                correctIndex: validCorrectIndex,
                explanation,
              });
            }
            break;
          }
        }
      }

      if (!isEdit) {
        finalId = `custom-l${targetLevel}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        questionBank[targetLevel].unshift({
          id: finalId,
          level: targetLevel,
          subject,
          cognitiveTag,
          question: questionText,
          options: cleanOpts,
          correctIndex: validCorrectIndex,
          explanation,
        });
      }

      persistQuestionBank(questionBank);
      broadcastAdmins('admin:questions', { questionBank });
      sendToClient(clientId, 'admin:question_saved', { id: finalId, isEdit });
      broadcastRoomState();
      break;
    }

    case 'admin:delete_question': {
      if (!adminClientIds.has(clientId)) return;
      const id = typeof payload.id === 'string' ? payload.id : '';
      const lvlNum = Number(payload.level);
      const lvl: 1 | 2 | 3 = lvlNum === 2 ? 2 : lvlNum === 3 ? 3 : 1;

      if (questionBank[lvl].length <= 1) {
        sendToClient(clientId, 'admin:question_error', {
          message: `Minimal harus tersisa 1 soal pada Level ${lvl}.`,
        });
        return;
      }

      const beforeLen = questionBank[lvl].length;
      questionBank[lvl] = questionBank[lvl].filter((q) => q.id !== id);
      if (questionBank[lvl].length !== beforeLen) {
        persistQuestionBank(questionBank);
        broadcastAdmins('admin:questions', { questionBank });
        broadcastRoomState();
      }
      break;
    }

    case 'admin:reset_questions': {
      if (!adminClientIds.has(clientId)) return;
      questionBank = cloneDefaultQuestionBank();
      persistQuestionBank(questionBank);
      broadcastAdmins('admin:questions', { questionBank });
      sendToClient(clientId, 'admin:question_saved', { id: 'reset', isEdit: false });
      broadcastRoomState();
      break;
    }

    case 'chat:send': {
      const isAdmin = adminClientIds.has(clientId);
      const pid = clientToPlayerId.get(clientId);
      const sender = pid ? players.get(pid) : undefined;
      if (!isAdmin && !sender) return;

      const now = Date.now();
      const lastAt = lastChatAtByClient.get(clientId) || 0;
      if (now - lastAt < 350) return;

      const rawText = typeof payload.text === 'string' ? payload.text.trim() : '';
      const cleanText = rawText.replace(/\s+/g, ' ').slice(0, 160);
      if (!cleanText) return;

      lastChatAtByClient.set(clientId, now);

      const message: ChatMessage = {
        id: `chat-${now}-${Math.random().toString(36).slice(2, 7)}`,
        senderId: isAdmin ? 'admin' : sender!.id,
        senderName: isAdmin ? 'Guru (Admin)' : sender!.name,
        senderRole: isAdmin ? 'admin' : 'student',
        text: cleanText,
        timestamp: now,
      };

      chatHistory.push(message);
      if (chatHistory.length > 50) {
        chatHistory.splice(0, chatHistory.length - 50);
      }

      broadcastAll('chat:message', { message });
      break;
    }
  }
}

// Authoritative 1-second server countdown timer
setInterval(() => {
  if (serverPhase !== 'Playing') return;

  timeLeft = Math.max(0, timeLeft - 1);
  broadcastAll('room:timer', { timeLeft });

  if (timeLeft <= 0) {
    concludeLevel();
  }
}, 1000);

// Clean up stale HTTP fallback clients if their tab closed without logout
setInterval(() => {
  const now = Date.now();
  for (const client of Array.from(clients.values())) {
    if (client.transport === 'http' && now - client.lastSeenAt > 20000) {
      disconnectClient(client.id);
    }
  }
}, 5000);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      phase: serverPhase,
      players: players.size,
      admins: adminClientIds.size,
    });
  });

  // HTTP fallback transport endpoints (ensures instant connectivity even if WebSocket upgrades are blocked by proxy/iframe)
  const handleHttpConnect = (_req: express.Request, res: express.Response) => {
    const clientId = `http-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    clients.set(clientId, {
      id: clientId,
      transport: 'http',
      queue: [],
      lastSeenAt: Date.now(),
    });
    res.json({
      ok: true,
      clientId,
      snapshot: buildSnapshot(),
    });
  };
  app.get('/api/client/connect', handleHttpConnect);
  app.post('/api/client/connect', handleHttpConnect);

  app.get('/api/client/poll', (req, res) => {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const client = clients.get(clientId);
    if (!client) {
      res.json({
        ok: false,
        expired: true,
        events: [],
        snapshot: buildSnapshot(),
      });
      return;
    }
    client.lastSeenAt = Date.now();
    res.json({
      ok: true,
      events: drainClientQueue(clientId),
      snapshot: buildSnapshot(),
    });
  });

  app.post('/api/client/action', (req, res) => {
    const body = (req.body || {}) as {
      clientId?: string;
      type?: string;
      payload?: Record<string, unknown>;
    };
    let clientId = typeof body.clientId === 'string' ? body.clientId : '';
    const type = typeof body.type === 'string' ? body.type : '';
    const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Record<
      string,
      unknown
    >;

    if (!clientId || !clients.has(clientId)) {
      if (type === 'auth:login_student' || type === 'auth:login_admin') {
        clientId = `http-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        clients.set(clientId, {
          id: clientId,
          transport: 'http',
          queue: [],
          lastSeenAt: Date.now(),
        });
      } else {
        res.status(404).json({ ok: false, expired: true });
        return;
      }
    }

    handleClientMessage(clientId, type, payload);
    res.json({
      ok: true,
      clientId,
      events: drainClientQueue(clientId),
      snapshot: buildSnapshot(),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    clients.set(clientId, {
      id: clientId,
      transport: 'ws',
      ws,
      queue: [],
      lastSeenAt: Date.now(),
    });

    sendToClient(clientId, 'room:state', buildSnapshot());

    ws.on('message', (raw) => {
      let msg: { type: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      handleClientMessage(clientId, msg.type, msg.payload || {});
    });

    ws.on('close', () => {
      disconnectClient(clientId);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Petualangan Kuis Nusantara server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
