import { useEffect, useRef, useState } from 'react';
import { hasDestination, NEED_DESTINATION } from '../../../shared/askFromParams';
import { suggestionChips } from '../../../shared/suggestionChips';
import type { Attraction, ChatMessage, TripState } from '../../../shared/types';
import { AttractionSelectCard } from './AttractionSelectCard';
import { Avatar, Icon } from './Icon';

function FollowUps({ message, lastRec, lastAssistantId, destination, selectedCount, streaming, locked, onGenerate, onSend }: {
  message: ChatMessage; lastRec?: string; lastAssistantId?: string; destination: string; selectedCount: number;
  streaming: boolean; locked: boolean; onGenerate: () => void; onSend: (text: string) => void;
}) {
  const chips = message.id === lastAssistantId ? suggestionChips(destination, message.text, message.recommendationContext) : [];
  const showGenerate = !!message.recommendations?.length && message.id === lastRec;
  if (!showGenerate && !chips.length) return null;
  return <div className="pt-1 flex flex-wrap gap-2">
    {showGenerate && <button data-testid="generate" disabled={!selectedCount || streaming || locked} onClick={onGenerate}
      className="h-10 px-4 bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md rounded-pill inline-flex items-center gap-1.5 disabled:opacity-50">
      <Icon name="auto_awesome" className="text-[16px]" /><span>{streaming ? '生成中…' : `生成路线（已选 ${selectedCount}）`}</span>
    </button>}
    {chips.map(chip => <button key={chip.text} data-testid="suggestion-chip" onClick={() => onSend(chip.text)} className="h-10 px-3 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container text-on-surface font-label-md text-label-md rounded-field inline-flex items-center gap-1.5">
      <Icon name={chip.icon} className="text-[15px]" />{chip.label}
    </button>)}
  </div>;
}

/** 中栏：聊天流 + 推荐卡 + 输入栏 */
export function ChatPanel({ messages, byId, selected, onToggle, onSend, onGenerate, busy, streaming, sample, state, pendingDestination = null, cooldown = 0 }: {
  messages: ChatMessage[]; byId: Record<string, Attraction>; selected: Set<string>; onToggle: (id: string) => void;
  onSend: (t: string) => void; onGenerate: () => void; busy: boolean; streaming: boolean; sample: boolean; state: TripState; pendingDestination?: string | null; cooldown?: number;
}) {
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // 只滚对话区。scrollIntoView 会连 html/body 和 overflow:hidden 的外壳一起滚，外壳滚不动时整页就像被锁住。
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);
  const locked = cooldown > 0;
  const typed = text.trim();
  // 输入框里正在打的城市也算已填。真正落库和拼诉求放在发送时，避免用上一帧的空目的地。
  const ready = hasDestination(state) || !!pendingDestination?.trim();
  const canSend = !locked && !busy && (!!typed || ready);
  const submit = () => {
    if (busy || locked) return;
    if (typed) setText('');
    onSend(typed);
  };
  const lastRec = [...messages].reverse().find(m => m.recommendations)?.id;
  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scroller} data-testid="chat-scroll" className="pane-scroll flex-1">
        <div className="px-5 md:px-6 py-6 flex flex-col gap-6">
        {messages.map(m => m.role === 'user' ? (
          <div key={m.id} className="flex justify-end pl-8">
            <div className="px-4 py-3 rounded-card rounded-tr-tail bg-surface-container text-on-surface font-body-md text-body-md leading-relaxed max-w-lg">{m.text}</div>
          </div>
        ) : (
          <div key={m.id} className="flex items-start gap-3 pr-2 md:pr-6">
            <Avatar size={28} />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex items-center gap-2 min-h-7">
                <span className="font-headline-sm text-[16px] leading-6 text-on-surface">行程助手</span>
              </div>
              <div className="px-4 py-3.5 rounded-card rounded-tl-tail bg-surface-container-low text-on-surface font-body-md text-body-md border border-outline-variant flex flex-col gap-4">
                <p className="leading-relaxed whitespace-pre-line">{m.text}</p>
                {!!m.recommendations?.length && <div className="flex flex-col gap-3">
                  {m.recommendations.map(id => byId[id] && <AttractionSelectCard key={id} a={byId[id]} checked={selected.has(id)} onToggle={() => onToggle(id)} />)}
                </div>}
                <FollowUps message={m} lastRec={lastRec} lastAssistantId={lastAssistantId} destination={state.destination} selectedCount={selected.size} streaming={streaming} locked={locked} onGenerate={onGenerate} onSend={onSend} />
              </div>
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-3"><Avatar size={28} /><span className="font-body-sm text-body-sm text-outline">思考中…</span></div>}
        </div>
      </div>
      <div className="px-4 md:px-5 pt-4 pb-4 bg-surface-container-lowest border-t border-outline-variant flex flex-col gap-2.5">
        <div className="relative bg-surface-container-lowest border border-outline-variant rounded-field p-3 focus-within:border-primary">
          <textarea data-testid="composer" disabled={locked} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="w-full bg-transparent resize-none border-0 text-on-surface font-body-md text-body-md focus:outline-none placeholder:text-outline" placeholder={locked ? `规划得有点快，${cooldown} 秒后可继续…` : ready ? '留空将按上方规划参数推荐景点，也可直接描述需求' : "告诉我您的需求，如'带爸妈慢慢逛西湖'或'把下午改成坐船'..."} rows={2} />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1 text-on-surface-variant">
              <button className="w-8 h-8 rounded-pill border border-outline-variant hover:bg-surface-container inline-flex items-center justify-center" title="添加附件（未实现）"><Icon name="attach_file" className="text-[16px]" /></button>
              <button className="w-8 h-8 rounded-pill border border-outline-variant hover:bg-surface-container inline-flex items-center justify-center" title="语音输入（未实现）"><Icon name="mic" className="text-[16px]" /></button>
            </div>
            <button aria-label={canSend ? '发送' : NEED_DESTINATION} data-testid="send" disabled={locked || busy} title={canSend ? '发送诉求' : NEED_DESTINATION} onClick={submit} className={`send-btn${!canSend && !locked && !busy ? ' opacity-50' : ''}`}>{locked ? <span data-testid="cooldown">{cooldown}</span> : <><span>发送诉求</span><Icon name="arrow_forward" className="text-[16px]" /></>}</button>
          </div>
        </div>
        <div className="text-center text-label-sm text-outline leading-4">{sample ? '景点为本地示例数据 · ' : ''}不提供订票与支付 · 出行前请以景区官方信息为准</div>
      </div>
    </div>
  );
}
