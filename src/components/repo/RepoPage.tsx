import { useState, useRef, useCallback } from 'react';
import { PenLine, Users, Download, Send, Palette, Save, Plus, LogIn, FolderOpen, Trash2, X, ChevronDown, MessageSquare, TrendingUp, Sparkles } from 'lucide-react';
import type { Message, RepoData, TemplateId, AtmosphereTag, Member, GroupId } from '@/types/repo';
import { TEMPLATES, ATMOSPHERE_TAGS, GROUP_META } from '@/types/repo';
import { getMemberById, MOCK_REPOS } from '@/utils/repo-mock-data';
import MemberSelector from './MemberSelector';
import ChatEditor from './ChatEditor';
import RepoCommunity from './RepoCommunity';
import MeguriTemplate from './templates/MeguriTemplate';
import LineTemplate from './templates/LineTemplate';
import OshiColorTemplate from './templates/OshiColorTemplate';

type Tab = 'generator' | 'community';

interface SavedRepo {
  id: string;
  memberId: string;
  memberName: string;
  groupId: GroupId;
  memberImageUrl: string;
  label: string;         // e.g. "2026/3/8 第1部"
  savedAt: string;
  data: {
    eventDate: string;
    eventType: string;
    slotNumber: number;
    ticketCount: number;
    nickname: string;
    messages: Message[];
    tags: AtmosphereTag[];
    template: TemplateId;
  };
}

interface MemberFolder {
  memberId: string;
  memberName: string;
  groupId: GroupId;
  memberImageUrl: string;
  repos: SavedRepo[];
}

// Mock auth state (will be replaced with real auth)
interface AuthUser {
  id: string;
  name: string;
  avatar?: string;
}

const PLACEHOLDER_DATA: RepoData = {
  memberId: '',
  memberName: 'メンバー名',
  groupId: 'nogizaka',
  groupName: 'グループ名',
  memberImageUrl: '',
  eventDate: '2026/3/18',
  eventType: 'ミーグリ',
  slotNumber: 1,
  ticketCount: 1,
  nickname: 'ニックネーム',
  messages: [
    { id: 'ph1', speaker: 'me', text: 'こんにちは！' },
    { id: 'ph2', speaker: 'member', text: 'やっほー！来てくれてありがとう♪' },
  ],
  tags: [],
};

export default function RepoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('community');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Mock auth (toggle for demo)
  const [user, setUser] = useState<AuthUser | null>(null);

  // Saved repos grouped by member
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Generator state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  });
  const [eventType, setEventType] = useState('ミーグリ');
  const [slotNumber, setSlotNumber] = useState(1);
  const [ticketCount, setTicketCount] = useState(1);
  const [nickname, setNickname] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init_1', speaker: 'me', text: '' },
    { id: 'init_2', speaker: 'member', text: '' },
  ]);
  const [tags, setTags] = useState<AtmosphereTag[]>([]);
  const [template, setTemplate] = useState<TemplateId>('meguri');
  const [customMemberAvatar, setCustomMemberAvatar] = useState<string | undefined>();
  const [userAvatar, setUserAvatar] = useState<string | undefined>();

  const previewRef = useRef<HTMLDivElement>(null);

  const selectedMember = selectedMemberId ? getMemberById(selectedMemberId) : null;
  const groupColor = selectedMember ? GROUP_META[selectedMember.group].color : '#742581';

  function handleMemberSelect(member: Member) {
    setSelectedMemberId(member.id);
    setCustomMemberAvatar(undefined); // reset custom avatar when changing member
  }

  function handleAvatarUpload(file: File, target: 'member' | 'user') {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        if (target === 'member') setCustomMemberAvatar(e.target.result as string);
        else setUserAvatar(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  function toggleTag(tag: AtmosphereTag) {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 2 ? [...prev, tag] : prev,
    );
  }

  // Build preview data: always show something
  const repoData: RepoData = selectedMember
    ? {
        memberId: selectedMember.id,
        memberName: selectedMember.name,
        groupId: selectedMember.group,
        groupName: selectedMember.groupName,
        memberImageUrl: customMemberAvatar || selectedMember.imageUrl,
        eventDate,
        eventType,
        slotNumber,
        ticketCount,
        nickname,
        userAvatar,
        customMemberAvatar,
        messages: messages.filter(m => m.text.trim() || m.imageUrl),
        tags,
      }
    : PLACEHOLDER_DATA;

  const hasContent = selectedMember && messages.some(m => m.text.trim() || m.imageUrl);

  // Group repos by member for sidebar
  const memberFolders: MemberFolder[] = (() => {
    const map = new Map<string, MemberFolder>();
    for (const repo of savedRepos) {
      if (!map.has(repo.memberId)) {
        map.set(repo.memberId, {
          memberId: repo.memberId,
          memberName: repo.memberName,
          groupId: repo.groupId,
          memberImageUrl: repo.memberImageUrl,
          repos: [],
        });
      }
      map.get(repo.memberId)!.repos.push(repo);
    }
    return Array.from(map.values());
  })();

  // Save current repo
  function handleSave() {
    if (!selectedMember) {
      alert('先にメンバーを選択してください');
      return;
    }
    const id = activeRepoId || `repo_${Date.now()}`;
    const saved: SavedRepo = {
      id,
      memberId: selectedMember.id,
      memberName: selectedMember.name,
      groupId: selectedMember.group,
      memberImageUrl: selectedMember.imageUrl,
      label: `${eventDate} 第${slotNumber}部`,
      savedAt: new Date().toISOString(),
      data: { eventDate, eventType, slotNumber, ticketCount, nickname, messages, tags, template },
    };
    setSavedRepos(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setActiveRepoId(id);
    setExpandedMemberId(selectedMember.id);
  }

  // Load a saved repo
  function loadRepo(repo: SavedRepo) {
    setActiveRepoId(repo.id);
    setSelectedMemberId(repo.memberId);
    setEventDate(repo.data.eventDate);
    setEventType(repo.data.eventType);
    setSlotNumber(repo.data.slotNumber);
    setTicketCount(repo.data.ticketCount);
    setNickname(repo.data.nickname);
    setMessages(repo.data.messages);
    setTags(repo.data.tags);
    setTemplate(repo.data.template);
    setExpandedMemberId(repo.memberId);
  }

  // New blank repo under a specific member
  function newRepoForMember(memberId: string) {
    const member = getMemberById(memberId);
    setActiveRepoId(null);
    setSelectedMemberId(memberId);
    setNickname('');
    setMessages([{ id: 'init_1', speaker: 'me', text: '' }, { id: 'init_2', speaker: 'member', text: '' }]);
    setTags([]);
    setExpandedMemberId(memberId);
  }

  // New completely blank repo
  function newRepo() {
    setActiveRepoId(null);
    setSelectedMemberId(null);
    setNickname('');
    setMessages([{ id: 'init_1', speaker: 'me', text: '' }, { id: 'init_2', speaker: 'member', text: '' }]);
    setTags([]);
  }

  function deleteRepo(id: string) {
    setSavedRepos(prev => prev.filter(r => r.id !== id));
    if (activeRepoId === id) newRepo();
  }

  const handleDownload = useCallback(async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `repo_${selectedMember?.name || 'repo'}_${eventDate.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
      alert('画像の生成に失敗しました。');
    }
  }, [selectedMember, eventDate]);

  function renderPreview() {
    switch (template) {
      case 'meguri':     return <MeguriTemplate data={repoData} />;
      case 'line':       return <LineTemplate data={repoData} />;
      case 'oshi-color': return <OshiColorTemplate data={repoData} />;
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activeTab === 'community' ? (
        <>
          {/* Page header (matching photocard page layout) */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={20} className="text-[var(--color-brand-nogi)]" />
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">握手Repo</h1>
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">记录你的线上见面会对话，浏览社区精彩互动</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('generator')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              <Sparkles size={14} /> 写Repo
            </button>
          </div>

          {/* Stats bar (matching photocard page with colored icon backgrounds) */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-brand-nogi) 10%, transparent)', color: 'var(--color-brand-nogi)' }}>
                <MessageSquare size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">{MOCK_REPOS.length.toLocaleString()}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">总作品数</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-brand-sakura) 10%, transparent)', color: 'var(--color-brand-sakura)' }}>
                <Users size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">{new Set(MOCK_REPOS.map(r => r.userId)).size}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">创作者</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-brand-hinata) 10%, transparent)', color: 'var(--color-brand-hinata)' }}>
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">+{MOCK_REPOS.filter(r => { const d = new Date(r.createdAt); const now = new Date(); return d.toDateString() === now.toDateString(); }).length}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">今日新增</p>
              </div>
            </div>
          </div>

          {/* Create CTA (matching photocard page) */}
          <div className="rounded-xl border border-[var(--border-primary)] bg-gradient-to-r from-[var(--bg-primary)] to-[var(--bg-secondary)] p-6 mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">写下你的握手会记录</h2>
                <p className="text-xs text-[var(--text-tertiary)]">
                  选择成员 → 输入对话 → 选择模板 → 生成并下载精美图片
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('generator')}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 shrink-0"
                style={{ backgroundColor: 'var(--color-brand-nogi)' }}
              >
                <Sparkles size={14} /> 进入生成器
              </button>
            </div>
          </div>

          {/* Community content */}
          <RepoCommunity />
        </>
      ) : (
        <>
          {/* Generator header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setActiveTab('community')}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                <X size={18} />
              </button>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Repo作成</h2>
            </div>
            {/* Demo auth */}
            {!user && (
              <button type="button" onClick={() => setUser({ id: 'demo', name: 'ヨル' })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--text-primary)] text-white hover:opacity-90 transition-opacity">
                <LogIn size={12} /> ログイン
              </button>
            )}
          </div>

          {/* Generator: 3-column layout */}
          <div className="flex gap-5">
            {/* Left sidebar: My Repos */}
            <div className="hidden lg:block w-[200px] shrink-0">
              <div className="sticky top-20 space-y-3">
                <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-secondary)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-[var(--text-secondary)]">マイレポ</h3>
                    <button type="button" onClick={newRepo} className="p-1 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]" title="新規">
                      <Plus size={14} />
                    </button>
                  </div>
                  {!user ? (
                    <div className="text-center py-6">
                      <LogIn size={20} className="mx-auto text-[var(--text-tertiary)] opacity-40 mb-2" />
                      <p className="text-[10px] text-[var(--text-tertiary)]">ログインすると保存できます</p>
                    </div>
                  ) : memberFolders.length === 0 ? (
                    <div className="text-center py-6">
                      <FolderOpen size={20} className="mx-auto text-[var(--text-tertiary)] opacity-40 mb-2" />
                      <p className="text-[10px] text-[var(--text-tertiary)]">保存されたレポはありません</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                      {memberFolders.map(folder => {
                        const isExpanded = expandedMemberId === folder.memberId;
                        const color = GROUP_META[folder.groupId]?.color || '#999';
                        return (
                          <div key={folder.memberId}>
                            <button type="button" onClick={() => setExpandedMemberId(isExpanded ? null : folder.memberId)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
                              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: color }}>
                                {folder.memberName.charAt(0)}
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <div className="text-[11px] font-medium truncate">{folder.memberName}</div>
                                <div className="text-[9px] text-[var(--text-tertiary)]">{folder.repos.length} 件</div>
                              </div>
                              <ChevronDown size={12} className={`text-[var(--text-tertiary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            {isExpanded && (
                              <div className="ml-4 pl-2 border-l-2 space-y-0.5 mt-0.5" style={{ borderColor: color + '40' }}>
                                {folder.repos.map(repo => (
                                  <div key={repo.id} onClick={() => loadRepo(repo)}
                                    className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[10px] ${activeRepoId === repo.id ? 'bg-[var(--bg-tertiary)] font-medium' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                                    <div className="flex-1 min-w-0 truncate text-[var(--text-secondary)]">{repo.label}</div>
                                    <button type="button" onClick={e => { e.stopPropagation(); deleteRepo(repo.id); }}
                                      className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400"><Trash2 size={10} /></button>
                                  </div>
                                ))}
                                <button type="button" onClick={() => newRepoForMember(folder.memberId)}
                                  className="w-full px-2 py-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-left">＋ 新規レポ</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Middle: Editor */}
            <div className="w-full lg:w-[380px] shrink-0 space-y-4">
              <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-secondary)] p-5 space-y-4">
                <MemberSelector selectedMemberId={selectedMemberId} onSelect={handleMemberSelect} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">日付</label>
                    <input type="text" value={eventDate} onChange={e => setEventDate(e.target.value)} placeholder="2026/3/8"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none focus:ring-2 focus:ring-[var(--border-primary)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">イベント</label>
                    <select value={eventType} onChange={e => setEventType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none">
                      <option>ミーグリ</option><option>オンラインミート&グリート</option><option>個別握手会</option><option>全国握手会</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">部</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-tertiary)]">第</span>
                      <input type="number" min={1} max={20} value={slotNumber} onChange={e => setSlotNumber(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                      <span className="text-sm text-[var(--text-tertiary)]">部</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">枚数</label>
                    <input type="number" min={1} max={30} value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">ニックネーム</label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="ミーグリで呼ばれる名前"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-secondary)] p-5">
                <ChatEditor messages={messages} onChange={setMessages} memberName={selectedMember?.name || ''} groupColor={groupColor} />
              </div>

              <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-secondary)] p-5">
                <h2 className="text-xs font-medium text-[var(--text-tertiary)] mb-2">雰囲気タグ（最大2つ）</h2>
                <div className="flex flex-wrap gap-1.5">
                  {ATMOSPHERE_TAGS.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                      className={`px-3 py-1.5 text-xs rounded-full transition-all ${tags.includes(t.id) ? 'bg-[var(--text-primary)] text-white shadow-sm' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-primary)]'}`}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Preview */}
            <div className="flex-1 min-w-0">
              <div className="sticky top-20 space-y-4">
                <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-secondary)] p-4">
                  <div className="flex gap-2">
                    {TEMPLATES.map(t => (
                      <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs transition-all text-center ${template === t.id ? 'bg-[var(--text-primary)] text-white shadow-sm' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                        <div className="font-medium">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-secondary)] p-6 flex justify-center ${!hasContent ? 'opacity-60' : ''}`}>
                  <div ref={previewRef}>{renderPreview()}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleDownload} disabled={!hasContent}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Download size={14} /> ダウンロード
                  </button>
                  <button type="button" onClick={handleSave} disabled={!user}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border-secondary)] text-xs font-medium text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Save size={14} /> {activeRepoId ? '上書き' : '保存'}
                  </button>
                  <button type="button" disabled={!hasContent || !user}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    style={{ backgroundColor: groupColor }}>
                    <Send size={14} /> 公開
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
