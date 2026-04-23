import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, initAuth } from '@/stores/auth';
import { Shield, MessageCircle, ExternalLink, User, Clock, XCircle } from 'lucide-react';

const API_BASE = 'https://api.46log.com';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * GeoPassGate — JP users without geo_pass see a blocking overlay.
 * Three states:
 *   1. Not logged in → login / register
 *   2. Logged in, not applied or pending → go to dashboard to apply
 *   3. Logged in, rejected → join QQ/Discord for manual verification
 * Skips if: has geo_pass cookie, or logged in as admin, or verification approved.
 */
export default function GeoPassGate() {
  const auth = useStore($auth);
  const [blocked, setBlocked] = useState(false);
  const [isJP, setIsJP] = useState(false);

  // Init auth on mount
  useEffect(() => { initAuth(); }, []);

  // Geo check
  useEffect(() => {
    // Already has geo_pass cookie → skip
    if (getCookie('geo_pass')) return;

    const cached = sessionStorage.getItem('geo_country');
    if (cached === 'JP') {
      setIsJP(true);
      return;
    }
    if (cached && cached !== 'JP') return;

    fetch(`${API_BASE}/api/auth/geo-check`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const country = data?.country || '';
        sessionStorage.setItem('geo_country', country);
        if (country === 'JP') setIsJP(true);
      })
      .catch(() => {});
  }, []);

  // Determine blocked state based on geo + auth
  useEffect(() => {
    if (!isJP) { setBlocked(false); return; }
    if (getCookie('geo_pass')) { setBlocked(false); return; }
    // Still loading auth → don't block yet
    if (auth.loading) { setBlocked(false); return; }
    // Logged in admin or approved user → don't block
    if (auth.isLoggedIn && (auth.role === 'admin' || auth.verificationStatus === 'approved')) {
      setBlocked(false);
      return;
    }
    // JP + no geo_pass + not approved → block
    setBlocked(true);
  }, [isJP, auth.loading, auth.isLoggedIn, auth.role, auth.verificationStatus]);

  if (!blocked) return null;

  // Determine which state to show
  const isLoggedIn = auth.isLoggedIn;
  const vs = auth.verificationStatus; // 'none' | 'pending' | 'rejected'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center" style={{ background: 'linear-gradient(135deg, #742581 0%, #a855f7 100%)' }}>
          <Shield size={32} className="mx-auto text-white/90 mb-2" />
          <h2 className="text-lg font-bold text-white">地域制限 / 地域限制</h2>
          <p className="text-xs text-white/70 mt-1">Access Restricted for Japan IP</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Japanese notice (always shown) */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>🇯🇵 日本のIPアドレスからのアクセスは制限されています。</strong><br />
              当サイトは中国語圏の坂道ファン向けサービスです。アクセスするにはアカウント登録後、審査を受けてください。
            </p>
          </div>

          {/* ── State 1: Not logged in ── */}
          {!isLoggedIn && (
            <>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                  <strong>检测到日本 IP，访问受限内容需要通过身份审核。</strong><br />
                  请先登录或注册账号，然后在个人中心提交认证申请。
                </p>
              </div>
              <a
                href="/auth/login"
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-purple-400 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: '#742581' }}>
                  <ExternalLink size={14} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">登录 / 注册</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">ログイン / 新規登録</p>
                </div>
              </a>
            </>
          )}

          {/* ── State 2: Logged in, none or pending ── */}
          {isLoggedIn && (vs === 'none' || vs === 'pending') && (
            <>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
                <p className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                  {vs === 'none' ? (
                    <>
                      <strong>你已登录，还需要完成认证审核。</strong><br />
                      请前往个人中心提交认证申请，审核通过后即可访问所有内容。
                    </>
                  ) : (
                    <>
                      <strong>你的认证申请正在审核中。</strong><br />
                      通常 24 小时内完成，如需加急可加群联系管理员。
                    </>
                  )}
                </p>
              </div>
              {vs === 'none' ? (
                <a
                  href="/user"
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-purple-400 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: '#742581' }}>
                    <User size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">前往个人中心</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">提交认证申请</p>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
                  <Clock size={16} className="text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">审核中，请耐心等待</p>
                </div>
              )}
            </>
          )}

          {/* ── State 3: Logged in, rejected ── */}
          {isLoggedIn && vs === 'rejected' && (
            <>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                  <strong>认证未通过。</strong><br />
                  仅凭提交的说明无法确认身份，请加入以下群组联系管理员完成人工验证。你也可以在个人中心重新提交申请。
                </p>
              </div>
              <div className="space-y-2">
                <div
                  onClick={() => navigator.clipboard.writeText('915448805')}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-blue-400 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#12B7F5] text-white">
                    <MessageCircle size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">QQ 群</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">群号: 915448805（点击复制）</p>
                  </div>
                </div>
                <a
                  href="https://discord.gg/n8F7Eq4vyD"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-indigo-400 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#5865F2] text-white">
                    <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Discord</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">discord.gg/n8F7Eq4vyD</p>
                  </div>
                </a>
              </div>
              <a
                href="/user"
                className="block text-center text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                或前往个人中心重新提交申请 →
              </a>
            </>
          )}

          {/* Footer note */}
          <p className="text-[10px] text-[var(--text-tertiary)] text-center leading-relaxed">
            审核通过后即可无限制访问所有内容（博客、MSG归档、广播等）。<br />
            審査完了後、すべてのコンテンツに無制限でアクセスできます。
          </p>
        </div>
      </div>
    </div>
  );
}
