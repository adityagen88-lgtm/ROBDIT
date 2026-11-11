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

interface ServerPlayer {
  id: string;
  socket: WebSocket;
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

const players = new Map<string, ServerPlayer>();
const adminSockets = new Set<WebSocket>();
const socketToPlayerId = new Map<WebSocket, string>();
const boxOpenedUntil = new Map<string, number>();
const chatHistory: ChatMessage[] = [];
const lastChatAtBySocket = new Map<WebSocket, number>();

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
    adminConnectedCount: adminSockets.size,
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

function sendJson(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastAdmins(type: string, payload: unknown) {
  const raw = JSON.stringify({ type, payload });
  for (const adminWs of adminSockets) {
    if (adminWs.readyState === WebSocket.OPEN) {
      adminWs.send(raw);
    }
  }
}

function broadcastAll(type: string, payload: unknown, exceptSocket?: WebSocket) {
  const raw = JSON.stringify({ type, payload });
  for (const p of players.values()) {
    if (p.socket !== exceptSocket && p.socket.readyState === WebSocket.OPEN) {
      p.socket.send(raw);
    }
  }
  for (const adminWs of adminSockets) {
    if (adminWs !== exceptSocket && adminWs.readyState === WebSocket.OPEN) {
      adminWs.send(raw);
    }
  }
}

function broadcastRoomState() {
  broadcastAll('room:state', buildSnapshot());
}

function pickUniqueQuestionForPlayer(player: ServerPlayer, level: 1 | 2 | 3): QuizQuestion {
  const bank = questionBank[level];
  const unseen = bank.filter((q) => !player.answeredQuestionIds.has(q.id));
  const pool = unseen.length > 0 ? unseen : bank;
  if (unseen.length === 0) {
    // Only reset this level's seen history if player exhausted every single question in this level
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

    // Eliminate 5-10 lowest-scoring players while preserving at least 3 survivors for Podium when possible
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
    // End of Level 3 -> Compute Winner Podium Top 3
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

// Authoritative 1-second server countdown timer
setInterval(() => {
  if (serverPhase !== 'Playing') return;

  timeLeft = Math.max(0, timeLeft - 1);
  broadcastAll('room:timer', { timeLeft });

  if (timeLeft <= 0) {
    concludeLevel();
  }
}, 1000);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      phase: serverPhase,
      players: players.size,
      admins: adminSockets.size,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    // Send initial room state immediately on connection
    sendJson(ws, 'room:state', buildSnapshot());

    ws.on('message', (raw) => {
      let msg: { type: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const payload = msg.payload || {};

      switch (msg.type) {
        case 'auth:login_student': {
          const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
          const cleanName = (rawName || 'Penjelajah Cilik').slice(0, 20);
          const avatar = (typeof payload.avatarId === 'string' ? payload.avatarId : 'Rimbi') as AvatarId;
          const validAvatar: AvatarId = ['Rimbi', 'Samudra', 'Surya', 'Kirana'].includes(avatar)
            ? avatar
            : 'Rimbi';

          const existingId = socketToPlayerId.get(ws);
          if (existingId && players.has(existingId)) {
            const p = players.get(existingId)!;
            p.name = cleanName;
            p.avatarId = validAvatar;
            sendJson(ws, 'auth:accepted', { role: 'student', playerId: p.id });
            sendJson(ws, 'chat:history', { messages: chatHistory });
            broadcastRoomState();
            return;
          }

          adminSockets.delete(ws);
          const id = `plr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const angle = Math.random() * Math.PI * 2;
          const spawnR = 3 + Math.random() * 3;
          const newPlayer: ServerPlayer = {
            id,
            socket: ws,
            name: cleanName,
            avatarId: validAvatar,
            score: 0,
            // Students joining mid-match observe as Spectators until next round
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
          socketToPlayerId.set(ws, id);

          sendJson(ws, 'auth:accepted', { role: 'student', playerId: id });
          sendJson(ws, 'chat:history', { messages: chatHistory });
          broadcastRoomState();
          break;
        }

        case 'auth:login_admin': {
          const pin = typeof payload.pin === 'string' ? payload.pin.trim().toUpperCase() : '';
          if (pin !== ADMIN_PIN) {
            sendJson(ws, 'auth:error', {
              message: 'Kode Admin salah. Gunakan kode guru yang benar.',
            });
            return;
          }

          // Remove from student list if switching roles
          const oldId = socketToPlayerId.get(ws);
          if (oldId) {
            players.delete(oldId);
            socketToPlayerId.delete(ws);
          }

          adminSockets.add(ws);
          sendJson(ws, 'auth:accepted', { role: 'admin', playerId: null });
          sendJson(ws, 'admin:questions', { questionBank });
          sendJson(ws, 'chat:history', { messages: chatHistory });
          broadcastRoomState();
          break;
        }

        case 'auth:logout': {
          const pid = socketToPlayerId.get(ws);
          if (pid) {
            players.delete(pid);
            socketToPlayerId.delete(ws);
          }
          adminSockets.delete(ws);
          broadcastRoomState();
          break;
        }

        case 'player:move': {
          const pid = socketToPlayerId.get(ws);
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
            ws
          );
          break;
        }

        case 'box:open': {
          const pid = socketToPlayerId.get(ws);
          if (!pid || serverPhase !== 'Playing') return;
          const p = players.get(pid);
          if (!p || p.status !== 'Playing') return;

          const boxId = typeof payload.boxId === 'string' ? payload.boxId : '';
          if (!boxId) return;

          const now = Date.now();
          if (now < p.cooldownUntil) {
            const remaining = Math.ceil((p.cooldownUntil - now) / 1000);
            sendJson(ws, 'quiz:cooldown', { remaining });
            return;
          }

          const boxUntil = boxOpenedUntil.get(boxId) || 0;
          if (now < boxUntil) {
            sendJson(ws, 'quiz:error', { message: 'Mystery Box baru saja dibuka penjelajah lain!' });
            return;
          }

          const question = pickUniqueQuestionForPlayer(p, currentLevel);
          p.activeSession = { boxId, question };

          sendJson(ws, 'quiz:prompt', {
            boxId,
            question: stripAnswer(question),
          });
          break;
        }

        case 'quiz:submit': {
          const pid = socketToPlayerId.get(ws);
          if (!pid || serverPhase !== 'Playing') return;
          const p = players.get(pid);
          if (!p || !p.activeSession) return;

          const chosenIndex = Number(payload.chosenIndex);
          const session = p.activeSession;
          p.activeSession = null;

          // Record question as answered so this student never receives it again
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

            sendJson(ws, 'quiz:result', {
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
            sendJson(ws, 'quiz:result', {
              isCorrect: false,
              points: 0,
              cooldownSeconds: GAME_CONSTANTS.WRONG_ANSWER_COOLDOWN_SECONDS,
              explanation: session.question.explanation,
            });
          }
          break;
        }

        case 'admin:start_game': {
          if (!adminSockets.has(ws)) return;
          if (players.size < 1) {
            sendJson(ws, 'auth:error', {
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
          if (!adminSockets.has(ws)) return;
          concludeLevel();
          break;
        }

        case 'admin:next_level': {
          if (!adminSockets.has(ws) || !eliminationSummary) return;
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
          if (!adminSockets.has(ws)) return;
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
          if (!adminSockets.has(ws)) return;
          sendJson(ws, 'admin:questions', { questionBank });
          break;
        }

        case 'admin:save_question': {
          if (!adminSockets.has(ws)) return;
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
            sendJson(ws, 'admin:question_error', {
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
                    sendJson(ws, 'admin:question_error', {
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
          sendJson(ws, 'admin:question_saved', { id: finalId, isEdit });
          broadcastRoomState();
          break;
        }

        case 'admin:delete_question': {
          if (!adminSockets.has(ws)) return;
          const id = typeof payload.id === 'string' ? payload.id : '';
          const lvlNum = Number(payload.level);
          const lvl: 1 | 2 | 3 = lvlNum === 2 ? 2 : lvlNum === 3 ? 3 : 1;

          if (questionBank[lvl].length <= 1) {
            sendJson(ws, 'admin:question_error', {
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
          if (!adminSockets.has(ws)) return;
          questionBank = cloneDefaultQuestionBank();
          persistQuestionBank(questionBank);
          broadcastAdmins('admin:questions', { questionBank });
          sendJson(ws, 'admin:question_saved', { id: 'reset', isEdit: false });
          broadcastRoomState();
          break;
        }

        case 'chat:send': {
          const isAdmin = adminSockets.has(ws);
          const pid = socketToPlayerId.get(ws);
          const sender = pid ? players.get(pid) : undefined;
          if (!isAdmin && !sender) return;

          const now = Date.now();
          const lastAt = lastChatAtBySocket.get(ws) || 0;
          if (now - lastAt < 350) return;

          const rawText = typeof payload.text === 'string' ? payload.text.trim() : '';
          const cleanText = rawText.replace(/\s+/g, ' ').slice(0, 160);
          if (!cleanText) return;

          lastChatAtBySocket.set(ws, now);

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
    });

    ws.on('close', () => {
      lastChatAtBySocket.delete(ws);
      const pid = socketToPlayerId.get(ws);
      if (pid) {
        players.delete(pid);
        socketToPlayerId.delete(ws);
      }
      adminSockets.delete(ws);
      broadcastRoomState();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
