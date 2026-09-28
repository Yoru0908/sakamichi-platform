import { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Loader2, Radio, Link2, AlertCircle, ExternalLink } from 'lucide-react';
import {
  parseRadikoUrl,
  formatFtJst,
  errorMessage,
  createDownload,
  getJob,
  downloadUrl,
  type TimefreeJob,
} from './timefree-api';

const POLL_MS = 3000;

export default function TimefreeDownloader() {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<TimefreeJob | null>(null);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsed = useMemo(() => (url.trim() ? parseRadikoUrl(url) : null), [url]);
  const urlInvalid = url.trim().length > 0 && !parsed;

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const startPolling = (jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await getJob(jobId);
        if (res.data) {
          setJob(res.data);
          if (res.data.status === 'done' || res.data.status === 'failed') {
            stopPolling();
            if (res.data.status === 'failed') setError(errorMessage(res.data.error || undefined));
          }
        } else if (res.status === 404) {
          stopPolling();
          setError(errorMessage('not_found'));
        }
      } catch {
        // 轮询失败静默重试
      }
    }, POLL_MS);
  };

  const handleSubmit = async () => {
    if (!parsed || submitting) return;
    setSubmitting(true);
    setError('');
    setNeedLogin(false);
    setJob(null);
    try {
      const res = await createDownload(url.trim());
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setJob(res.data);
      if (res.data.status !== 'done' && res.data.status !== 'failed') {
        startPolling(res.data.job_id);
      } else if (res.data.status === 'failed') {
        setError(errorMessage(res.data.error || undefined));
      }
    } catch {
      setError('网络连接失败，请检查网络或稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || (job?.status === 'queued' || job?.status === 'downloading');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Link2 size={13} className="text-[var(--text-tertiary)]" />
          <span>粘贴 radiko 时移链接（radiko.jp/#!/ts/电台/时间 或 share 链接）</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); }}
            placeholder="https://radiko.jp/#!/ts/FMKAGAWA/20260928050000"
            className="flex-1 px-3 py-2.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)]/40"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!parsed || busy}
            className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-xl text-white transition-opacity disabled:opacity-40 hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand-sakura, #F19DB5)' }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            下载
          </button>
        </div>

        {urlInvalid && (
          <p className="text-[11px] text-red-500">链接格式不正确</p>
        )}
        {parsed && (
          <p className="text-[11px] text-[var(--text-tertiary)]">
            电台 <span className="font-medium text-[var(--text-secondary)]">{parsed.stationId}</span>
            <span className="mx-1">·</span>
            开始时间（JST）<span className="font-medium text-[var(--text-secondary)]">{formatFtJst(parsed.ft)}</span>
          </p>
        )}
        <p className="text-[10px] text-[var(--text-tertiary)]">仅支持已结束且 7 天内的节目，文件保留48小时</p>
      </div>

      {needLogin && (
        <a
          href="/auth/login"
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--color-brand-sakura)]/50 transition-colors"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: 'var(--color-brand-sakura, #F19DB5)' }}
          >
            <ExternalLink size={14} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">请先登录 / 注册</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">登录后才能下载节目</p>
          </div>
        </a>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3">
          <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {job && (
        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-3">
          <div className="flex items-start gap-3">
            {job.image ? (
              <img
                src={job.image}
                alt={job.title}
                className="w-16 h-16 rounded-lg object-cover bg-[var(--bg-tertiary)] shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-[var(--bg-tertiary)] shrink-0 flex items-center justify-center">
                <Radio size={18} className="text-[var(--text-tertiary)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{job.title || job.station}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-[var(--text-secondary)]">
                <span>{job.station}</span>
                {job.performer && <><span>·</span><span className="truncate">{job.performer}</span></>}
              </div>
              {(job.startTime || job.endTime) && (
                <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                  {job.startTime?.slice(0, 16).replace('T', ' ')} ~ {job.endTime?.slice(11, 16)}
                </p>
              )}
            </div>
          </div>

          {(job.status === 'queued' || job.status === 'downloading') && (
            <div className="space-y-1.5">
              <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((job.progress || 0) * 100)}%`,
                    backgroundColor: 'var(--color-brand-sakura, #F19DB5)',
                  }}
                />
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {job.status === 'queued' ? '排队中…' : `下载中 ${Math.round((job.progress || 0) * 100)}%`}
              </p>
            </div>
          )}

          {job.status === 'done' && job.download_path && (
            <a
              href={downloadUrl(job.download_path)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-xl text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-sakura, #F19DB5)' }}
            >
              <Download size={13} />
              下载音频文件
            </a>
          )}
        </div>
      )}
    </div>
  );
}
