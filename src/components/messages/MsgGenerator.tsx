import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { Plus, Trash2, Download, Image as ImageIcon, MessageSquare, Star, GripVertical } from 'lucide-react';
import {
  getGroupColor, getR2AvatarUrl, getHeaderStyle,
  GROUP_CONFIG, sortedGenEntries, fetchMemberData, deduplicateMembers,
  type MemberInfo,
} from './msg-styles';
import { $favorites, toggleFavorite, isFavorite, enrichFavorites } from '@/stores/favorites';

// ── Types ──
interface ChatBox {
  id: number;
  name: string;
  time: string;
  body: string;
  isImageChat: boolean;
  imageDataUrl?: string;
}

// ── Helpers ──
function nowTimeStr(): string {
  return new Date().toLocaleString('zh-Hant', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ── Member Sidebar ──
function MemberSidebar({
  members,
  activeGroup,
  onSelectMember,
  onChangeGroup,
}: {
  members: MemberInfo[];
  activeGroup: string;
  onSelectMember: (m: MemberInfo) => void;
  onChangeGroup: (g: string) => void;
}) {
  const favorites = useStore($favorites);
  const groups = ['乃木坂46', '櫻坂46', '日向坂46'];
  const isFavTab = activeGroup === '__favorites__';

  const filtered = isFavTab
    ? members.filter((m) => favorites.some((f) => f.name === m.name))
    : members.filter((m) => {
        if (activeGroup === '櫻坂46') return m.group === '櫻坂46' || m.group === '樱坂46';
        return m.group === activeGroup;
      });

  const byGen: Record<string, MemberInfo[]> = {};
  filtered.forEach((m) => {
    const gen = isFavTab ? (m.group ? (GROUP_CONFIG[m.group]?.name || m.group) : '不明') : (m.generation || '不明');
    if (!byGen[gen]) byGen[gen] = [];
    byGen[gen].push(m);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Group tabs + Favorites tab */}
      <div className="flex border-b border-[var(--border-primary)] shrink-0">
        {groups.map((g) => {
          const color = getGroupColor(g);
          const isActive = g === activeGroup;
          return (
            <button
              key={g}
              onClick={() => onChangeGroup(g)}
              className="flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer"
              style={{ borderColor: isActive ? color : 'transparent', color: isActive ? color : 'var(--text-tertiary)' }}
            >
              {GROUP_CONFIG[g]?.name || g}
            </button>
          );
        })}
        <button
          onClick={() => onChangeGroup('__favorites__')}
          className="flex-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-0.5"
          style={{ borderColor: isFavTab ? '#f59e0b' : 'transparent', color: isFavTab ? '#f59e0b' : 'var(--text-tertiary)' }}
        >
          <Star size={10} fill={isFavTab ? 'currentColor' : 'none'} /> 收藏
        </button>
      </div>

      {/* Favorites empty state */}
      {isFavTab && filtered.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <Star size={24} className="text-[var(--text-tertiary)] mb-2" />
          <p className="text-xs text-[var(--text-tertiary)]">还没有收藏成员</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">浏览成员列表，点击 ⭐ 收藏</p>
        </div>
      )}

      {/* Member list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {(isFavTab ? Object.entries(byGen) : sortedGenEntries(byGen)).map(([gen, mems]) => (
          <div key={gen} className="mb-3">
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">{gen}</p>
            <div className="space-y-0.5">
              {mems.map((m) => {
                const fav = isFavorite(m.name);
                return (
                  <div
                    key={m.name}
                    className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer group"
                    onClick={() => onSelectMember(m)}
                  >
                    <img
                      src={getR2AvatarUrl(m.name)}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-[var(--border-primary)]"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = m.imageUrl; }
                      }}
                    />
                    <span className="text-xs text-[var(--text-primary)] truncate flex-1">{m.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite({ name: m.name, group: m.group, imageUrl: m.imageUrl }); }}
                      className="text-[var(--text-tertiary)] hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title={fav ? '取消收藏' : '收藏'}
                    >
                      <Star size={12} fill={fav ? 'currentColor' : 'none'} className={fav ? 'text-amber-500' : ''} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat Preview ──
function ChatPreview({
  chatBoxes,
  headerName,
  headerGroup,
  avatarSrc,
  onUpdateChat,
  onDeleteChat,
  onHeaderNameChange,
  previewRef,
}: {
  chatBoxes: ChatBox[];
  headerName: string;
  headerGroup: string;
  avatarSrc: string;
  onUpdateChat: (id: number, field: keyof ChatBox, value: string) => void;
  onDeleteChat: (id: number) => void;
  onHeaderNameChange: (name: string) => void;
  previewRef: React.RefObject<HTMLDivElement | null>;
}) {
  const headerStyle = getHeaderStyle(headerGroup);

  return (
    <div ref={previewRef} className="bg-white" style={{ width: '100%', maxWidth: '500px' }}>
      {/* MSG header */}
      <div
        style={headerStyle}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onHeaderNameChange(e.currentTarget.textContent || '')}
      >
        {headerName}
      </div>

      {/* Chat boxes */}
      <div style={{ background: '#fff' }}>
        {chatBoxes.map((box) => (
          <div
            key={box.id}
            className="relative group"
            style={{ display: 'flex', padding: '20px', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}
          >
            {/* Delete button */}
            <button
              onClick={() => onDeleteChat(box.id)}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 cursor-pointer"
              style={{ zIndex: 2 }}
            >
              <Trash2 size={12} />
            </button>

            {/* Avatar */}
            <img
              src={avatarSrc}
              alt=""
              style={{ width: '50px', height: '50px', borderRadius: '50%', border: '2px solid #e5e7eb', objectFit: 'cover', flexShrink: 0 }}
            />

            {/* Content */}
            <div style={{ flex: 1, marginLeft: '12px', minWidth: 0 }}>
              {/* Name + time */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onUpdateChat(box.id, 'name', e.currentTarget.textContent || '')}
                  style={{ fontWeight: 300, fontSize: '14px', color: '#8a8a8a', outline: 'none' }}
                >
                  {box.name}
                </span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onUpdateChat(box.id, 'time', e.currentTarget.textContent || '')}
                  style={{ fontSize: '12px', color: '#8a8a8a', outline: 'none' }}
                >
                  {box.time}
                </span>
              </div>

              {/* Body */}
              {box.isImageChat && box.imageDataUrl ? (
                <div>
                  <img
                    src={box.imageDataUrl}
                    alt=""
                    style={{ maxWidth: '100%', borderRadius: '8px' }}
                  />
                </div>
              ) : box.isImageChat ? (
                <ImageDropZone
                  onImageLoad={(dataUrl) => onUpdateChat(box.id, 'imageDataUrl' as keyof ChatBox, dataUrl)}
                />
              ) : (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onUpdateChat(box.id, 'body', e.currentTarget.innerHTML)}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                  }}
                  style={{ fontSize: '15px', lineHeight: 1.6, color: '#1f2937', outline: 'none' }}
                  dangerouslySetInnerHTML={{ __html: box.body }}
                />
              )}
            </div>
          </div>
        ))}

        {chatBoxes.length === 0 && (
          <div className="py-16 text-center">
            <MessageSquare size={32} className="mx-auto mb-3" style={{ color: '#d1d5db' }} />
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>点击下方按钮添加对话框</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Image Drop Zone ──
function ImageDropZone({ onImageLoad }: { onImageLoad: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => { if (e.target?.result) onImageLoad(e.target.result as string); };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
      style={{ borderColor: dragOver ? '#7BC7E8' : '#e5e7eb' }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
    >
      <ImageIcon size={24} className="mx-auto mb-2" style={{ color: '#d1d5db' }} />
      <p className="text-xs" style={{ color: '#9ca3af' }}>点击或拖拽图片到此处</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
    </div>
  );
}

// ── Main Component ──
export default function MsgGenerator() {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState('乃木坂46');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Selected member state
  const [selectedName, setSelectedName] = useState('请选择成员');
  const [selectedGroup, setSelectedGroup] = useState('乃木坂46');
  const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23E0E0E0'/%3E%3Ccircle cx='100' cy='75' r='35' fill='%23BDBDBD'/%3E%3Cpath d='M 60 180 Q 60 120 100 120 Q 140 120 140 180 Z' fill='%23BDBDBD'/%3E%3C/svg%3E";
  const [avatarSrc, setAvatarSrc] = useState(DEFAULT_AVATAR);

  // Chat boxes
  const [chatBoxes, setChatBoxes] = useState<ChatBox[]>([
    { id: 1, name: '成员名', time: nowTimeStr(), body: '<p>1. 从左侧选择成员</p><p>2. 点击文字可直接编辑</p>', isImageChat: false },
  ]);
  const nextId = useRef(2);

  const previewRef = useRef<HTMLDivElement>(null);

  // Load members (shared: R2 msg-avatars/members.json → fallback /data/member-images.json)
  useEffect(() => {
    fetchMemberData()
      .then((images) => {
        const deduped = deduplicateMembers(images);
        const list: MemberInfo[] = Object.entries(deduped)
          .map(([name, info]: [string, any]) => ({
            name,
            imageUrl: info.imageUrl || info.url,
            group: info.group,
            generation: info.generation,
          }));
        setMembers(list);

        // Enrich favorites with group info (for legacy migrated entries)
        enrichFavorites(list);

        // Auto-apply first favorite member
        const favs = $favorites.get();
        if (favs.length > 0) {
          const first = list.find((m) => m.name === favs[0].name);
          if (first) applyMember(first);
        }
      })
      .catch((e) => console.error('[MsgGenerator] Failed to load members:', e))
      .finally(() => setLoading(false));
  }, []);

  const applyMember = useCallback((m: MemberInfo) => {
    setSelectedName(m.name);
    setSelectedGroup(m.group);
    const r2Url = getR2AvatarUrl(m.name);
    setAvatarSrc(r2Url);
    // Update all chat box names
    setChatBoxes((prev) => prev.map((box) => ({ ...box, name: m.name })));
    setSidebarOpen(false);
  }, []);

  const addTextChat = useCallback(() => {
    const id = nextId.current++;
    setChatBoxes((prev) => [...prev, { id, name: selectedName, time: nowTimeStr(), body: '<p>输入文字...</p>', isImageChat: false }]);
  }, [selectedName]);

  const addImageChat = useCallback(() => {
    const id = nextId.current++;
    setChatBoxes((prev) => [...prev, { id, name: selectedName, time: nowTimeStr(), body: '', isImageChat: true }]);
  }, [selectedName]);

  const deleteChat = useCallback((id: number) => {
    setChatBoxes((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateChat = useCallback((id: number, field: keyof ChatBox, value: string) => {
    setChatBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }, []);

  const downloadImage = useCallback(async () => {
    if (!previewRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const el = previewRef.current;
    const scale = 1000 / el.offsetWidth;
    const canvas = await html2canvas(el, { scale, useCORS: true, allowTaint: true });
    const link = document.createElement('a');
    const name = selectedName.replace(/\s+/g, '');
    const date = new Date().toLocaleDateString('zh', { month: '2-digit', day: '2-digit' }).replace(/\//g, '');
    link.download = `${name}_${date}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [selectedName]);

  return (
    <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
      {/* Sidebar - desktop */}
      <div className="hidden md:flex flex-col w-56 shrink-0 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
                <div className="h-3 flex-1 bg-[var(--bg-tertiary)] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <MemberSidebar
            members={members}
            activeGroup={activeGroup}
            onSelectMember={applyMember}
            onChangeGroup={setActiveGroup}
          />
        )}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 max-w-[80vw] bg-[var(--bg-primary)] border-r border-[var(--border-primary)] shadow-xl h-full">
            <MemberSidebar
              members={members}
              activeGroup={activeGroup}
              onSelectMember={applyMember}
              onChangeGroup={setActiveGroup}
            />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap justify-center">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          >
            选择成员
          </button>
          <button
            onClick={addTextChat}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          >
            <Plus size={12} /> 文字对话
          </button>
          <button
            onClick={addImageChat}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          >
            <ImageIcon size={12} /> 图片对话
          </button>
          <button
            onClick={downloadImage}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg text-white transition-colors cursor-pointer"
            style={{ background: getGroupColor(selectedGroup) }}
          >
            <Download size={12} /> 下载图片
          </button>
        </div>

        {/* Preview area */}
        <div className="rounded-xl overflow-hidden border border-[var(--border-primary)] shadow-sm" style={{ maxWidth: '500px', width: '100%' }}>
          <ChatPreview
            chatBoxes={chatBoxes}
            headerName={selectedName}
            headerGroup={selectedGroup}
            avatarSrc={avatarSrc}
            onUpdateChat={updateChat}
            onDeleteChat={deleteChat}
            onHeaderNameChange={setSelectedName}
            previewRef={previewRef}
          />
        </div>
      </div>
    </div>
  );
}
