import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Minimize2, Send } from 'lucide-react';
import { ChatMessage } from '../game/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  localPlayerId: string | null;
  isAdmin?: boolean;
  onSendMessage: (text: string) => void;
  defaultOpen?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  localPlayerId,
  isAdmin = false,
  onSendMessage,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState('');
  const [seenCount, setSeenCount] = useState(messages.length);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSeenCount(messages.length);
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [isOpen, messages.length]);

  const unreadCount = isOpen ? 0 : Math.max(0, messages.length - seenCount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      inputRef.current?.blur();
      return;
    }
    onSendMessage(trimmed);
    setDraft('');
    inputRef.current?.blur();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.currentTarget.blur();
          setIsOpen(true);
        }}
        className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950/92 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-100 shadow-xl transition-colors cursor-pointer whitespace-nowrap"
      >
        <MessageSquare className="w-4 h-4 text-amber-400 shrink-0" />
        <span>Obrolan Kelas</span>
        {unreadCount > 0 && (
          <span className="font-mono tabular-nums text-amber-300 font-bold">
            ({unreadCount})
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto w-72 sm:w-80 rounded-xl bg-slate-950/94 border border-slate-700 shadow-2xl text-slate-100 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2 text-xs font-display font-bold text-white">
          <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Obrolan Kelas</span>
        </div>
        <button
          type="button"
          aria-label="Tutup Obrolan"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.currentTarget.blur();
            setIsOpen(false);
          }}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer shrink-0"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        ref={listRef}
        className="h-44 overflow-y-auto px-3.5 py-2.5 space-y-2 text-xs"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-slate-500 px-2">
            Belum ada pesan. Sapa teman sekelasmu di sini!
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = isAdmin
              ? msg.senderRole === 'admin'
              : Boolean(localPlayerId && msg.senderId === localPlayerId);
            const nameColor =
              msg.senderRole === 'admin'
                ? 'text-amber-300'
                : isMine
                ? 'text-emerald-300'
                : 'text-sky-300';

            return (
              <div key={msg.id} className="leading-snug break-words">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-semibold ${nameColor}`}>
                    {msg.senderName}
                    {isMine && !isAdmin ? ' (Kamu)' : ''}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-slate-500 shrink-0">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-slate-200 mt-0.5">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 p-2 border-t border-slate-800 bg-slate-900/60"
      >
        <input
          ref={inputRef}
          type="text"
          maxLength={160}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          placeholder="Tulis pesan..."
          className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        <button
          type="submit"
          aria-label="Kirim Pesan"
          onPointerDown={(e) => e.preventDefault()}
          className="h-8 px-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
