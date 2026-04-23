import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { PenLine, Users, Download, Send, Palette, Save, Plus, LogIn, FolderOpen, Trash2, X, ChevronDown, ChevronRight, MessageSquare, TrendingUp, Sparkles, Heart, Star, Folder } from 'lucide-react';
import type { Message, RepoData, TemplateId, AtmosphereTag, Member, GroupId } from '@/types/repo';
import { TEMPLATES, ATMOSPHERE_TAGS, GROUP_META } from '@/types/repo';
import { getMemberById, MOCK_REPOS } from '@/utils/repo-mock-data';
import { createRepoWork } from '@/utils/auth-api';
import { $auth } from '@/stores/auth';
import { $favorites } from '@/stores/favorites';
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

type FolderCategory = 'oshi' | 'favorite' | 'custom';

interface MemberFolder {
  memberId: string;
  memberName: string;
  groupId: GroupId;
  memberImageUrl: string;
  category: FolderCategory;
  repos: SavedRepo[];
}

const CATEGORY_META: Record<FolderCategory, { label: string; icon: typeof Heart; color: string }> = {
  oshi: { label: '推し', icon: Heart, color: '#e11d48' },
  favorite: { label: 'お気に入り', icon: Star, color: '#f59e0b' },
  custom: { label: 'その他', icon: Folder, color: '#6b7280' },
};

const REPO_LS_KEY = 'sakamichi_saved_repos';

function loadSavedRepos(): SavedRepo[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(REPO_LS_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSavedRepos(repos: SavedRepo[]) {
  try { localStorage.setItem(REPO_LS_KEY, JSON.stringify(repos)); } catch { /* quota */ }
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

  // Auth & favorites from stores
  const auth = useStore($auth);
  const favorites = useStore($favorites);

  // Saved repos (persisted to localStorage)
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>(loadSavedRepos);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<FolderCategory | null>('oshi');
  const [repoSidebarOpen, setRepoSidebarOpen] = useState(true);

  // Persist savedRepos whenever they change
  useEffect(() => { persistSavedRepos(savedRepos); }, [savedRepos]);

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

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const memberAvatarInputRef = useRef<HTMLInputElement>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);

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

  // Derive member category from auth oshi + favorites store
  const favoriteNames = new Set(favorites.map(f => f.name));
  const getMemberCategory = useCallback((memberName: string): FolderCategory => {
    if (auth.oshiMember && memberName === auth.oshiMember) return 'oshi';
    if (favoriteNames.has(memberName)) return 'favorite';
    return 'custom';
  }, [auth.oshiMember, favoriteNames]);

  // Group repos by member for sidebar, with auto-category
  const memberFolders: MemberFolder[] = (() => {
    const map = new Map<string, MemberFolder>();
    for (const repo of savedRepos) {
      if (!map.has(repo.memberId)) {
        map.set(repo.memberId, {
          memberId: repo.memberId,
          memberName: repo.memberName,
          groupId: repo.groupId,
          memberImageUrl: repo.memberImageUrl,
          category: getMemberCategory(repo.memberName),
          repos: [],
        });
      }
      map.get(repo.memberId)!.repos.push(repo);
    }
    return Array.from(map.values());
  })();

  const foldersByCategory = (cat: FolderCategory) => memberFolders.filter(f => f.category === cat);

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

  const handlePublish = useCallback(async () => {
    if (!selectedMember || !hasContent) return;
    if (!auth.isLoggedIn) {
      setPublishError('请先登录才能发布');
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await createRepoWork({
        memberId: selectedMember.id,
        memberName: selectedMember.name,
        groupId: selectedMember.group,
        eventDate,
        eventType,
        slotNumber,
        ticketCount,
        nickname,
        messages: messages.filter(m => m.text.trim() || m.imageUrl).map(({ speaker, text, imageUrl }) => ({ speaker, text, imageUrl })),
        tags,
        template,
        isPublic: true,
      });
      if (res.success) {
        setActiveTab('community');
      } else {
        setPublishError(res.message || '发布失败，请稍后重试');
      }
    } catch {
      setPublishError('网络错误，请稍后重试');
    } finally {
      setPublishing(false);
    }
  }, [auth.isLoggedIn, selectedMember, hasContent, eventDate, eventType, slotNumber, ticketCount, nickname, messages, tags, template]);

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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setActiveTab('community')}
                className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                <X size={20} />
              </button>
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">创建Repo</h2>
                <p className="text-xs text-[var(--text-tertiary)]">选择成员 → 输入对话 → 预览 → 下载或发布</p>
              </div>
            </div>
          </div>

          {/* Generator: 2-column layout (editor + preview) */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Editor */}
            <div className="lg:w-[440px] shrink-0 space-y-4">
              {/* My Repos - folder tree */}
              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setRepoSidebarOpen(!repoSidebarOpen)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                    {repoSidebarOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <FolderOpen size={14} className="text-[var(--text-tertiary)]" />
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">我的Repo</h3>
                  <div className="flex-1" />
                  <button type="button" onClick={newRepo} className="text-[10px] text-[var(--color-brand-nogi)] hover:underline">+ 新建</button>
                </div>
                {repoSidebarOpen && (
                  <div className="space-y-1">
                    {(['oshi', 'favorite', 'custom'] as FolderCategory[]).map(cat => {
                      const meta = CATEGORY_META[cat];
                      const folders = foldersByCategory(cat);
                      const CatIcon = meta.icon;
                      const isExpanded = expandedCategory === cat;
                      return (
                        <div key={cat}>
                          <button type="button" onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                            className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] hover:bg-[var(--bg-tertiary)] transition-colors">
                            {isExpanded ? <ChevronDown size={10} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={10} className="text-[var(--text-tertiary)]" />}
                            <CatIcon size={11} style={{ color: meta.color }} />
                            <span className="font-medium text-[var(--text-secondary)]">{meta.label}</span>
                            {folders.length > 0 && <span className="text-[9px] text-[var(--text-tertiary)] ml-auto">{folders.reduce((n, f) => n + f.repos.length, 0)}</span>}
                          </button>
                          {isExpanded && (
                            <div className="ml-3 border-l border-[var(--border-primary)] pl-2 space-y-0.5 mt-0.5">
                              {folders.length === 0 ? (
                                <div className="text-[10px] text-[var(--text-tertiary)] py-1 pl-1">
                                  {cat === 'oshi' ? '选择成员后保存即可创建' : cat === 'favorite' ? '将常用成员标记为お気に入り' : '自定义分组'}
                                </div>
                              ) : folders.map(folder => {
                                const color = GROUP_META[folder.groupId]?.color || '#999';
                                const isMemberExpanded = expandedMemberId === folder.memberId;
                                return (
                                  <div key={folder.memberId}>
                                    <button type="button" onClick={() => setExpandedMemberId(isMemberExpanded ? null : folder.memberId)}
                                      className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] hover:bg-[var(--bg-tertiary)] transition-colors">
                                      {isMemberExpanded ? <ChevronDown size={9} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={9} className="text-[var(--text-tertiary)]" />}
                                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold shrink-0" style={{ backgroundColor: color }}>
                                        {folder.memberName.charAt(0)}
                                      </div>
                                      <span className="text-[var(--text-secondary)] truncate">{folder.memberName}</span>
                                      <span className="text-[9px] text-[var(--text-tertiary)] ml-auto shrink-0">{folder.repos.length}</span>
                                    </button>
                                    {isMemberExpanded && (
                                      <div className="ml-5 space-y-0.5 mt-0.5">
                                        {folder.repos.map(repo => (
                                          <button key={repo.id} type="button" onClick={() => loadRepo(repo)}
                                            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] transition-colors ${
                                              activeRepoId === repo.id ? 'bg-[var(--bg-tertiary)] font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                            }`}>
                                            <PenLine size={9} className="shrink-0" />
                                            <span className="truncate">{repo.label}</span>
                                            <button type="button" onClick={e => { e.stopPropagation(); deleteRepo(repo.id); }}
                                              className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-500"><Trash2 size={9} /></button>
                                          </button>
                                        ))}
                                        <button type="button" onClick={() => newRepoForMember(folder.memberId)}
                                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-[var(--text-tertiary)] hover:text-[var(--color-brand-nogi)] hover:bg-[var(--bg-tertiary)] transition-colors">
                                          <Plus size={9} /> 新建Repo
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">基本信息</h3>
                <MemberSelector selectedMemberId={selectedMemberId} onSelect={handleMemberSelect} />
                {/* Hidden file inputs */}
                <input ref={memberAvatarInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f, 'member'); e.target.value = ''; }} />
                <input ref={userAvatarInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f, 'user'); e.target.value = ''; }} />
                {/* Avatar upload buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">成员头像</label>
                    <button type="button" onClick={() => memberAvatarInputRef.current?.click()}
                      className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] hover:border-[var(--color-brand-nogi)] hover:text-[var(--color-brand-nogi)] transition-colors">
                      {customMemberAvatar ? (
                        <><img src={customMemberAvatar} className="w-4 h-4 rounded object-cover shrink-0" alt="" /><span className="truncate">已自定义</span></>
                      ) : (
                        <span>上传自定义图</span>
                      )}
                    </button>
                    {customMemberAvatar && (
                      <button type="button" onClick={() => setCustomMemberAvatar(undefined)}
                        className="mt-1 text-[10px] text-[var(--text-tertiary)] hover:text-red-400 w-full text-center">还原默认</button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">自己头像</label>
                    <button type="button" onClick={() => userAvatarInputRef.current?.click()}
                      className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] hover:border-[#4ECDC4] hover:text-[#4ECDC4] transition-colors">
                      {userAvatar ? (
                        <><img src={userAvatar} className="w-4 h-4 rounded-full object-cover shrink-0" alt="" /><span className="truncate">已上传</span></>
                      ) : (
                        <span>上传自己图</span>
                      )}
                    </button>
                    {userAvatar && (
                      <button type="button" onClick={() => setUserAvatar(undefined)}
                        className="mt-1 text-[10px] text-[var(--text-tertiary)] hover:text-red-400 w-full text-center">移除</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">日期</label>
                    <input type="text" value={eventDate} onChange={e => setEventDate(e.target.value)} placeholder="2026/3/8"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none focus:border-[var(--color-brand-nogi)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">活动</label>
                    <select value={eventType} onChange={e => setEventType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none">
                      <option>ミーグリ</option><option>オンラインミート&グリート</option><option>個別握手会</option><option>全国握手会</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">场次</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-tertiary)]">第</span>
                      <input type="number" min={1} max={20} value={slotNumber} onChange={e => setSlotNumber(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                      <span className="text-sm text-[var(--text-tertiary)]">部</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">券数</label>
                    <input type="number" min={1} max={30} value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">昵称（ニックネーム）</label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="见面会上被叫的名字"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-sm outline-none focus:border-[#4ECDC4]"
                    style={nickname ? { color: '#4ECDC4', fontWeight: 600 } : undefined} />
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-5">
                <ChatEditor messages={messages} onChange={setMessages} memberName={selectedMember?.name || ''} groupColor={groupColor} />
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-5">
                <h3 className="text-xs font-medium text-[var(--text-tertiary)] mb-2">氛围标签（最多2个）</h3>
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
                <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-4">
                  <h3 className="text-xs font-medium text-[var(--text-tertiary)] mb-2">模板选择</h3>
                  <div className="flex gap-2">
                    {TEMPLATES.map(t => (
                      <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs transition-all text-center ${template === t.id ? 'bg-[var(--text-primary)] text-white shadow-sm' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                        <div className="font-medium">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-6 flex justify-center ${!hasContent ? 'opacity-50' : ''}`}>
                  <div ref={previewRef}>{renderPreview()}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleDownload} disabled={!hasContent}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[var(--text-primary)] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Download size={14} /> 下载图片
                  </button>
                  <button type="button" onClick={handleSave}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--border-primary)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <Save size={14} /> {activeRepoId ? '覆盖保存' : '保存'}
                  </button>
                  <button type="button" onClick={handlePublish} disabled={!hasContent || publishing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    style={{ backgroundColor: groupColor }}>
                    <Send size={14} /> {publishing ? '发布中...' : '发布'}
                  </button>
                  {publishError && (
                    <div className="text-xs text-red-500 text-center mt-1 px-1">{publishError}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
