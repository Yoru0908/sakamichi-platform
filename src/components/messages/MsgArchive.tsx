import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { MessageCircle, ArrowLeft, Image, Video, Mic, ChevronLeft, Star, Play, Pause, Volume2, MoreVertical } from 'lucide-react';
import {
  getGroupColor, getR2AvatarUrl, getOptimizedAvatarUrl, getHeaderStyle,
  GROUP_CONFIG, sortedGenEntries, fetchMemberData, deduplicateMembers,
  type MemberInfo,
} from './msg-styles';
import { $favorites, toggleFavorite, isFavorite, enrichFavorites } from '@/stores/favorites';

interface ArchiveMemberInfo extends MemberInfo {
  url: string;
  placeholder?: string;
}

interface Message {
  id: number;
  message_id: string;
  site: string;
  group_name: string;
  member_name: string;
  type: 'text' | 'picture' | 'video' | 'voice';
  text: string;
  translated_text?: string;
  media_url?: string;
  published_at: string;
  created_at: string;
}

// --- Constants ---
const ARCHIVE_API_BASE = 'https://msg-archive.46log.com/api/archive';

// --- Custom Voice Player (replaces native <audio> which has seek issues) ---
function VoicePlayer({ src, color }: { src: string; color: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration || 0));
    audio.addEventListener('timeupdate', () => {
      if (!draggingRef.current) setCurrentTime(audio.currentTime);
    });
    audio.addEventListener('ended', () => { setPlaying(false); setCurrentTime(0); });
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play().catch(() => {}); }
    setPlaying(!playing);
  };

  const seekFromEvent = useCallback((clientX: number) => {
    const a = audioRef.current;
    const bar = barRef.current;
    if (!a || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    a.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    seekFromEvent(e.clientX);

    const onMove = (ev: MouseEvent) => seekFromEvent(ev.clientX);
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [seekFromEvent]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    draggingRef.current = true;
    seekFromEvent(e.touches[0].clientX);

    const onMove = (ev: TouchEvent) => { ev.preventDefault(); seekFromEvent(ev.touches[0].clientX); };
    const onEnd = () => {
      draggingRef.current = false;
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, [seekFromEvent]);

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2" style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '20px', background: '#f3f4f6' }}>
      <Mic size={14} style={{ color, flexShrink: 0 }} />
      <button
        onClick={toggle}
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors"
        style={{ background: '#e5e7eb' }}
      >
        {playing ? <Pause size={12} fill="currentColor" style={{ color: '#374151' }} /> : <Play size={12} fill="currentColor" style={{ color: '#374151', marginLeft: '1px' }} />}
      </button>
      <span style={{ fontSize: '12px', color: '#6b7280', minWidth: '70px', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(currentTime)} / {fmt(duration)}
      </span>
      <div
        ref={barRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="flex-1 relative cursor-pointer group"
        style={{ minWidth: '60px', padding: '6px 0' }}
      >
        <div className="h-1.5 rounded-full w-full" style={{ background: '#d1d5db' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${progress}%`, background: '#374151', pointerEvents: 'none' }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full shadow-sm"
          style={{ left: `calc(${progress}% - 7px)`, background: '#374151', pointerEvents: 'none' }}
        />
      </div>
      <Volume2 size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
    </div>
  );
}

function getGroupSiteKey(group: string): string {
  return GROUP_CONFIG[group]?.key || 'nogizaka';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}


// --- Entry Page: Member Card Grid ---
function MemberList({
  members,
  activeGroup,
  onSelectMember,
  onChangeGroup,
}: {
  members: ArchiveMemberInfo[];
  activeGroup: string;
  onSelectMember: (m: ArchiveMemberInfo) => void;
  onChangeGroup: (g: string) => void;
}) {
  const favorites = useStore($favorites);
  const groups = ['櫻坂46', '日向坂46']; // 乃木坂46 暂时隐藏（未订阅MSG）
  const isFavTab = activeGroup === '__favorites__';

  const filtered = isFavTab
    ? members.filter((m) => favorites.some((f) => f.name === m.name))
    : members.filter((m) => {
        if (activeGroup === '櫻坂46') return m.group === '櫻坂46' || m.group === '樱坂46';
        return m.group === activeGroup;
      });

  // Group by generation (or by group name in favorites tab)
  const byGen: Record<string, ArchiveMemberInfo[]> = {};
  filtered.forEach((m) => {
    const gen = isFavTab ? (m.group ? (GROUP_CONFIG[m.group]?.name || m.group) : '不明') : (m.generation || '不明');
    if (!byGen[gen]) byGen[gen] = [];
    byGen[gen].push(m);
  });

  return (
    <div>
      {/* Group tabs + Favorites tab */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-primary)]">
        {groups.map((g) => {
          const color = getGroupColor(g);
          const isActive = g === activeGroup;
          return (
            <button
              key={g}
              onClick={() => onChangeGroup(g)}
              className="px-4 py-2.5 text-xs font-medium border-b-2 transition-colors duration-200"
              style={{
                borderColor: isActive ? color : 'transparent',
                color: isActive ? color : 'var(--text-tertiary)',
              }}
            >
              {GROUP_CONFIG[g]?.name || g}
            </button>
          );
        })}
        <button
          onClick={() => onChangeGroup('__favorites__')}
          className="px-4 py-2.5 text-xs font-medium border-b-2 transition-colors duration-200 flex items-center gap-1"
          style={{
            borderColor: isFavTab ? '#f59e0b' : 'transparent',
            color: isFavTab ? '#f59e0b' : 'var(--text-tertiary)',
          }}
        >
          <Star size={12} fill={isFavTab ? 'currentColor' : 'none'} /> 收藏
        </button>
      </div>

      {/* Favorites empty state */}
      {isFavTab && filtered.length === 0 && (
        <div className="py-16 text-center">
          <Star size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-tertiary)]">还没有收藏成员</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">浏览成员列表，点击 ⭐ 收藏常看的成员</p>
        </div>
      )}

      {/* Member grid by generation (sorted small→large) */}
      {(isFavTab ? Object.entries(byGen) : sortedGenEntries(byGen)).map(([gen, mems]) => (
        <div key={gen} className="mb-6">
          <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">{gen}</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {mems.map((m) => {
              const fav = isFavorite(m.name);
              return (
                <div
                  key={m.name}
                  className="group relative rounded-xl overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-primary)] text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  {/* Favorite toggle button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite({ name: m.name, group: m.group, imageUrl: m.imageUrl }); }}
                    className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-black/30 hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                    title={fav ? '取消收藏' : '收藏'}
                  >
                    <Star size={12} fill={fav ? 'currentColor' : 'none'} className={fav ? 'text-amber-400' : 'text-white/80'} />
                  </button>

                  <div onClick={() => onSelectMember(m)}>
                    <div className="aspect-[3/4] w-full overflow-hidden">
                      <img
                        src={getOptimizedAvatarUrl(m.name, 400)}
                        alt={m.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (!img.dataset.fallback) {
                            img.dataset.fallback = '1';
                            img.src = m.url;
                          } else {
                            img.src = m.placeholder || '/images/placeholder.png';
                          }
                        }}
                      />
                    </div>
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate px-2 py-2">{m.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Detail Page: MSG生成 style chat view ---
function MemberDetail({
  member,
  messages,
  msgLoading,
  onBack,
  nickname,
}: {
  member: ArchiveMemberInfo;
  messages: Message[];
  msgLoading: boolean;
  onBack: () => void;
  nickname: string;
}) {
  const color = getGroupColor(member.group);
  const headerStyle = getHeaderStyle(member.group);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom (newest messages) when messages load
  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="max-w-[380px] mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs mb-4 transition-colors hover:opacity-80"
        style={{ color }}
      >
        <ChevronLeft size={14} /> 返回成员列表
      </button>

      {/* MSG-style header bar (group-specific gradient from MSG生成) */}
      <div style={headerStyle}>
        {member.name}
      </div>

      {/* Chat container (matches MSG生成 .chat-container) */}
      <div
        ref={chatContainerRef}
        style={{
          background: 'white',
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
        }}
      >
        {msgLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: `${color} transparent ${color} ${color}` }} />
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>加载消息中...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center">
            <MessageCircle size={32} className="mx-auto mb-3" style={{ color: '#d1d5db' }} />
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>暂无消息数据</p>
            <p style={{ fontSize: '12px', color: '#d1d5db', marginTop: '4px' }}>MSG推送部署归档后将自动积累</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={msg.id}
              className="flex items-start transition-colors"
              style={{
                padding: '20px',
                borderBottom: i < messages.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
            >
              {/* Avatar (70px, matches MSG生成 .avatar) */}
              <img
                src={getOptimizedAvatarUrl(member.name, 280)}
                alt={member.name}
                style={{ width: '70px', height: '70px', borderRadius: '50%', border: '2px solid #e5e7eb', objectFit: 'cover', flexShrink: 0 }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.dataset.fallback) {
                    img.dataset.fallback = '1';
                    img.src = member.url;
                  }
                }}
              />

              {/* Content (matches MSG生成 .chat-content) */}
              <div style={{ flex: 1, marginLeft: '16px', minWidth: 0 }}>
                {/* Header: name + time */}
                <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 300, fontSize: '15px', color: '#374151' }}>{member.name}</span>
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>{formatTime(msg.published_at)}</span>
                </div>

                {/* Message body (matches MSG生成 .chat-body) */}
                <div style={{ fontSize: '15px', lineHeight: 1.6, color: '#1f2937' }}>
                  {msg.text && (
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {nickname ? msg.text.replace(/%%%/g, nickname) : msg.text}
                    </p>
                  )}

                  {msg.translated_text && (
                    <p style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.6, padding: '8px 12px', borderRadius: '8px', background: '#f9fafb', color: '#6b7280' }}>
                      {msg.translated_text}
                    </p>
                  )}

                  {msg.type === 'picture' && msg.media_url && (
                    <img
                      src={msg.media_url}
                      alt=""
                      style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', marginTop: '10px', maxHeight: '300px', objectFit: 'contain' }}
                      loading="lazy"
                    />
                  )}

                  {msg.type === 'video' && msg.media_url && (
                    <video
                      src={msg.media_url}
                      controls
                      style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '10px', maxHeight: '300px' }}
                      preload="metadata"
                    />
                  )}

                  {msg.type === 'voice' && msg.media_url && (
                    <VoicePlayer src={msg.media_url} color={color} />
                  )}

                  {msg.type === 'picture' && !msg.media_url && (
                    <div className="flex items-center gap-1" style={{ marginTop: '10px', fontSize: '13px', color: '#9ca3af' }}>
                      <Image size={14} /> <span>图片消息</span>
                    </div>
                  )}
                  {msg.type === 'video' && !msg.media_url && (
                    <div className="flex items-center gap-1" style={{ marginTop: '10px', fontSize: '13px', color: '#9ca3af' }}>
                      <Video size={14} /> <span>视频消息</span>
                    </div>
                  )}
                  {msg.type === 'voice' && !msg.media_url && (
                    <div className="flex items-center gap-1" style={{ marginTop: '10px', fontSize: '13px', color: '#9ca3af' }}>
                      <Mic size={14} /> <span>语音消息</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --- Main Component ---
export default function MsgArchive() {
  const auth = useStore($auth);
  const [members, setMembers] = useState<ArchiveMemberInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState('櫻坂46');
  const [selectedMember, setSelectedMember] = useState<ArchiveMemberInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Load member data (shared: R2 msg-avatars/members.json → fallback /data/member-images.json)
  useEffect(() => {
    fetchMemberData()
      .then((images) => {
        const deduped = deduplicateMembers(images);
        const list: ArchiveMemberInfo[] = Object.entries(deduped)
          .map(([name, info]: [string, any]) => ({
            name,
            imageUrl: info.imageUrl || info.url,
            url: info.imageUrl || info.url,
            group: info.group,
            generation: info.generation,
            placeholder: info.placeholder,
          }));
        setMembers(list);

        // Enrich favorites with group info (for legacy migrated entries)
        enrichFavorites(list);

        // Deep link: auto-select member from ?member= URL param
        const params = new URLSearchParams(window.location.search);
        const memberParam = params.get('member');
        if (memberParam) {
          const match = list.find((m) => m.name === memberParam || m.name.replace(/\s+/g, '') === memberParam);
          if (match) {
            handleSelectMember(match);
            // Set correct group tab
            if (match.group) setActiveGroup(match.group === '樱坂46' ? '櫻坂46' : match.group);
          }
        }
      })
      .catch((e) => console.error('[MsgArchive] Failed to load members:', e))
      .finally(() => setLoading(false));
  }, []);

  const [msgLoading, setMsgLoading] = useState(false);

  const handleSelectMember = useCallback((m: ArchiveMemberInfo) => {
    setSelectedMember(m);
    setMessages([]);
    setMsgLoading(true);

    const encodedName = encodeURIComponent(m.name);
    fetch(`${ARCHIVE_API_BASE}/messages/${encodedName}?limit=100`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.messages) {
          setMessages(data.messages);
        }
      })
      .catch((e) => console.error('[MsgArchive] Failed to load messages:', e))
      .finally(() => setMsgLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {[...Array(18)].map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-primary)]">
            <div className="aspect-[3/4] w-full bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3 bg-[var(--bg-tertiary)] rounded animate-pulse mx-2 my-2" />
          </div>
        ))}
      </div>
    );
  }

  if (selectedMember) {
    return (
      <MemberDetail
        member={selectedMember}
        messages={messages}
        msgLoading={msgLoading}
        onBack={() => setSelectedMember(null)}
        nickname={auth.displayName || ''}
      />
    );
  }

  return (
    <MemberList
      members={members}
      activeGroup={activeGroup}
      onSelectMember={handleSelectMember}
      onChangeGroup={setActiveGroup}
    />
  );
}
