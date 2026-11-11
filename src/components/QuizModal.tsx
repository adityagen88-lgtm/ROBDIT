import React, { useEffect } from 'react';
import { ActiveQuizSession } from '../game/types';

interface QuizModalProps {
  session: ActiveQuizSession;
  onSubmitAnswer: (chosenIndex: number) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export const QuizModal: React.FC<QuizModalProps> = ({ session, onSubmitAnswer }) => {
  const { question } = session;

  // Support A/B/C/D or 1/2/3/4 keyboard shortcuts for quick answering
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      if (key === 'A' || key === '1') {
        e.preventDefault();
        onSubmitAnswer(0);
      } else if (key === 'B' || key === '2') {
        e.preventDefault();
        onSubmitAnswer(1);
      } else if (key === 'C' || key === '3') {
        e.preventDefault();
        onSubmitAnswer(2);
      } else if (key === 'D' || key === '4') {
        e.preventDefault();
        onSubmitAnswer(3);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSubmitAnswer]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-question-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-slate-950 border border-slate-700 p-6 md:p-7 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between gap-4 text-xs text-slate-400 mb-3">
          <span>
            {question.subject} <span aria-hidden="true">·</span> {question.cognitiveTag}
          </span>
          <span className="tabular-nums font-mono text-amber-400">Level {question.level}</span>
        </div>

        <h2
          id="quiz-question-title"
          className="font-display text-lg md:text-xl font-semibold text-white leading-snug mb-6"
        >
          {question.question}
        </h2>

        <div className="grid grid-cols-1 gap-3">
          {question.options.map((opt, index) => (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSubmitAnswer(index);
              }}
              className="flex items-center gap-3.5 w-full min-h-12 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 hover:border-amber-400 text-left text-sm md:text-base text-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <span className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center font-mono text-xs font-bold text-amber-300 shrink-0">
                {OPTION_LETTERS[index]}
              </span>
              <span className="leading-snug">{opt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
