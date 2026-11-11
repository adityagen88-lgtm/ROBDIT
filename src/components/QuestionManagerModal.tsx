import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { LEVEL_CONFIGS } from '../game/config';
import { QuestionBankMap, QuestionSubject, QuizQuestion } from '../game/types';

export interface QuestionDraft {
  id?: string;
  level: 1 | 2 | 3;
  subject: QuestionSubject;
  cognitiveTag: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

interface QuestionManagerModalProps {
  questionBank: QuestionBankMap;
  errorMessage: string | null;
  statusMessage: string | null;
  onClearMessages: () => void;
  onSaveQuestion: (draft: QuestionDraft) => void;
  onDeleteQuestion: (id: string, level: 1 | 2 | 3) => void;
  onResetQuestions: () => void;
  onClose: () => void;
}

const SUBJECTS: QuestionSubject[] = [
  'Matematika',
  'Bahasa Indonesia',
  'IPA',
  'PPKn',
  'IPS',
];

const COGNITIVE_OPTIONS = [
  'C1 · Mengingat',
  'C2 · Memahami',
  'C3 · Menerapkan',
  'C4 · Menganalisis',
  'C5 · Mengevaluasi',
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function createEmptyDraft(level: 1 | 2 | 3): QuestionDraft {
  return {
    level,
    subject: 'Matematika',
    cognitiveTag:
      level === 1
        ? 'C1 · Mengingat'
        : level === 2
        ? 'C3 · Menerapkan'
        : 'C4 · Menganalisis',
    question: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
  };
}

export const QuestionManagerModal: React.FC<QuestionManagerModalProps> = ({
  questionBank,
  errorMessage,
  statusMessage,
  onClearMessages,
  onSaveQuestion,
  onDeleteQuestion,
  onResetQuestions,
  onClose,
}) => {
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Close editor form cleanly when a save succeeds on server
  useEffect(() => {
    if (statusMessage) {
      setDraft(null);
      setLocalError(null);
      setConfirmReset(false);
    }
  }, [statusMessage]);

  const filteredQuestions = useMemo(() => {
    const list = questionBank[activeLevel] || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.cognitiveTag.toLowerCase().includes(q) ||
        item.options.some((opt) => opt.toLowerCase().includes(q))
    );
  }, [questionBank, activeLevel, searchQuery]);

  const openCreateForm = () => {
    onClearMessages();
    setLocalError(null);
    setDraft(createEmptyDraft(activeLevel));
  };

  const openEditForm = (item: QuizQuestion) => {
    onClearMessages();
    setLocalError(null);
    setDraft({
      id: item.id,
      level: item.level,
      subject: item.subject,
      cognitiveTag: item.cognitiveTag,
      question: item.question,
      options: [...item.options] as [string, string, string, string],
      correctIndex: item.correctIndex,
      explanation: item.explanation,
    });
  };

  const handleOptionChange = (idx: number, val: string) => {
    if (!draft) return;
    const nextOpts = [...draft.options] as [string, string, string, string];
    nextOpts[idx] = val;
    setDraft({ ...draft, options: nextOpts });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.question.trim()) {
      setLocalError('Teks pertanyaan wajib diisi.');
      return;
    }
    if (draft.options.some((o) => !o.trim())) {
      setLocalError('Keempat pilihan jawaban (A, B, C, D) wajib diisi.');
      return;
    }
    setLocalError(null);
    onSaveQuestion({
      ...draft,
      question: draft.question.trim(),
      options: draft.options.map((o) => o.trim()) as [string, string, string, string],
      explanation: draft.explanation.trim(),
    });
  };

  const displayError = localError || errorMessage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/85"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-manager-title"
    >
      <div className="w-full max-w-5xl h-[90vh] rounded-2xl bg-slate-950 border border-slate-700 shadow-2xl text-slate-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/70">
          <div>
            <h2 id="question-manager-title" className="font-display text-lg md:text-xl font-bold text-white">
              Kelola Bank Soal Kelas
            </h2>
            <p className="text-xs text-slate-400">
              Tambah, ubah, atau hapus soal per level sebelum maupun di antara sesi permainan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Reset Soal Bawaan</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetQuestions();
                    setConfirmReset(false);
                  }}
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  Ya, Kembalikan 60 Soal
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Batal
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Tambah Soal</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Kelola Soal"
              className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Level Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3] as const).map((lvl) => {
              const cfg = LEVEL_CONFIGS[lvl];
              const count = questionBank[lvl]?.length ?? 0;
              const active = activeLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setActiveLevel(lvl)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-amber-400 border-amber-300 text-slate-950'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  Level {lvl}: {cfg.name} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari soal atau mapel..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {/* Status / Error Banner */}
        {(displayError || statusMessage) && (
          <div className="px-5 pt-3">
            {displayError ? (
              <div className="px-3.5 py-2 rounded-lg bg-rose-950 border border-rose-500 text-rose-100 text-xs font-medium">
                {displayError}
              </div>
            ) : (
              <div className="px-3.5 py-2 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-100 text-xs font-medium">
                {statusMessage}
              </div>
            )}
          </div>
        )}

        {/* Body: List + Optional Add/Edit Form */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
          {/* Question List */}
          <div
            className={`${
              draft ? 'hidden lg:block lg:col-span-6' : 'lg:col-span-12'
            } overflow-y-auto p-5 space-y-3`}
          >
            {filteredQuestions.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Tidak ada soal yang cocok dengan pencarian pada Level {activeLevel}.
              </div>
            ) : (
              filteredQuestions.map((item, idx) => {
                const isEditing = draft?.id === item.id;
                const canDelete = (questionBank[item.level]?.length ?? 0) > 1;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isEditing
                        ? 'bg-slate-900 border-amber-400'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="text-xs text-slate-400">
                        <span className="font-mono text-amber-300 font-semibold">#{idx + 1}</span>
                        {' · '}
                        <span className="text-slate-200 font-medium">{item.subject}</span>
                        {' · '}
                        <span>{item.cognitiveTag}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? 'Hapus soal ini'
                              : 'Minimal harus tersisa 1 soal pada level ini'
                          }
                          onClick={() => onDeleteQuestion(item.id, item.level)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>

                    <div className="text-sm font-medium text-white leading-snug mb-2.5">
                      {item.question}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {item.options.map((opt, optIdx) => {
                        const isCorrect = optIdx === item.correctIndex;
                        return (
                          <div
                            key={optIdx}
                            className={`px-2.5 py-1.5 rounded-lg border ${
                              isCorrect
                                ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-200 font-semibold'
                                : 'bg-slate-950/70 border-slate-800 text-slate-400'
                            }`}
                          >
                            <span className="font-mono mr-1.5">{OPTION_LETTERS[optIdx]}.</span>
                            <span>{opt}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add / Edit Form Pane */}
          {draft && (
            <form
              onSubmit={handleSubmit}
              className="lg:col-span-6 overflow-y-auto p-5 space-y-4 bg-slate-900/40"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <h3 className="font-display font-bold text-base text-white">
                  {draft.id ? 'Edit Soal' : 'Tambah Soal Baru'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setLocalError(null);
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Tutup Form
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Level Arena
                  </label>
                  <select
                    value={draft.level}
                    onChange={(e) =>
                      setDraft({ ...draft, level: Number(e.target.value) as 1 | 2 | 3 })
                    }
                    className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value={1}>Level 1 · Hutan Pemula</option>
                    <option value={2}>Level 2 · Kuil Misterius</option>
                    <option value={3}>Level 3 · Gunung Emas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mata Pelajaran
                  </label>
                  <select
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft({ ...draft, subject: e.target.value as QuestionSubject })
                    }
                    className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {SUBJECTS.map((subj) => (
                      <option key={subj} value={subj}>
                        {subj}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tingkat Kognitif
                  </label>
                  <select
                    value={
                      COGNITIVE_OPTIONS.includes(draft.cognitiveTag)
                        ? draft.cognitiveTag
                        : COGNITIVE_OPTIONS[0]
                    }
                    onChange={(e) => setDraft({ ...draft, cognitiveTag: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {COGNITIVE_OPTIONS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Teks Pertanyaan
                </label>
                <textarea
                  rows={3}
                  value={draft.question}
                  onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                  placeholder="Tulis pertanyaan kuis untuk siswa..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Pilihan Jawaban & Kunci Benar
                  </span>
                  <span className="text-xs text-emerald-400 font-semibold">
                    Kunci: {OPTION_LETTERS[draft.correctIndex]}
                  </span>
                </div>
                <div className="space-y-2">
                  {OPTION_LETTERS.map((letter, idx) => {
                    const isCorrect = draft.correctIndex === idx;
                    return (
                      <div key={letter} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, correctIndex: idx })}
                          aria-label={`Tandai ${letter} sebagai jawaban benar`}
                          className={`h-10 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                            isCorrect
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          <span className="font-mono">{letter}</span>
                          {isCorrect && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <input
                          type="text"
                          value={draft.options[idx]}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                          placeholder={`Pilihan ${letter}`}
                          className="flex-1 h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Klik tombol huruf A/B/C/D di sebelah kiri untuk menentukan kunci jawaban yang benar.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Pembahasan Singkat (Opsional)
                </label>
                <input
                  type="text"
                  value={draft.explanation}
                  onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                  placeholder="Penjelasan singkat yang tampil saat siswa menjawab benar..."
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setLocalError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-sm cursor-pointer whitespace-nowrap"
                >
                  {draft.id ? 'Simpan Perubahan' : 'Tambahkan Soal'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
