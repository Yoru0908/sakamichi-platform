/** Shared report dialog for community works and repo works */

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { submitReport, REPORT_REASONS } from '@/utils/community-api';
import type { ReportReason, ReportTargetType } from '@/utils/community-api';

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}

export default function ReportDialog({ targetType, targetId, onClose }: Props) {
  const [selected, setSelected] = useState<ReportReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setErr('');
    try {
      await submitReport(targetType, targetId, selected);
      setDone(true);
    } catch (e: any) {
      setErr(e.message || '举报失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10001 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-[var(--bg-primary)] rounded-xl shadow-xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">✅</div>
            <p className="text-sm text-[var(--text-primary)] font-medium">举报已提交</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">感谢您的反馈，我们会尽快处理</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:opacity-80 transition-opacity"
            >
              关闭
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Flag size={16} className="text-red-500" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">举报内容</h3>
            </div>
            <div className="space-y-2">
              {REPORT_REASONS.map(r => (
                <label
                  key={r.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected === r.id
                      ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                      : 'border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.id}
                    checked={selected === r.id}
                    onChange={() => setSelected(r.id)}
                    className="accent-red-500"
                  />
                  <span className="text-sm text-[var(--text-primary)]">{r.label}</span>
                </label>
              ))}
            </div>
            {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '提交中...' : '提交举报'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
