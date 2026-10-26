import { useEffect, useState } from "react";
import { Copy, Download, Share2, X } from "lucide-react";
import type { MiguriTranslate } from "@/i18n/miguri";
import { copyText, shareOrDownloadImage } from "../seichi/route-share";
import {
  miguriShareText,
  renderMiguriShareImage,
  type MiguriPeriod,
  type MiguriShareCard,
} from "./miguri-share";

// 共有画像 (2026-10-26): preview, then share / save / copy the post. The dialog follows the UI language; the image is Japanese.
type Props = {
  card: MiguriShareCard;
  empty: boolean;
  years: number[];
  period: MiguriPeriod;
  onPeriod: (period: MiguriPeriod) => void;
  tr: MiguriTranslate;
  onClose: () => void;
};

function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

const chip = (on: boolean) =>
  `min-h-10 rounded-full border px-4 text-xs font-semibold ${
    on
      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
      : "border-[var(--border-primary)] text-[var(--text-secondary)]"
  }`;
const action =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-indigo-500/45 disabled:opacity-40";

export default function MiguriShareDialog({ card, empty, years, period, onPeriod, tr, onClose }: Props) {
  const [showSpend, setShowSpend] = useState(true);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const text = miguriShareText(card, showSpend);
  const filename = `46log-miguri-${period}.png`;

  useEffect(() => {
    setImage(null);
    setFailed(false);
    setStatus("");
    if (empty) return;
    let alive = true;
    let url = "";
    renderMiguriShareImage(card, showSpend)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [card, showSpend, empty]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const share = async () => {
    if (!image) return;
    const result = await shareOrDownloadImage(image.blob, { filename, title: card.title.join(""), text });
    if (result === "downloaded") setStatus(tr("shareSaved"));
  };
  const copy = async () => setStatus((await copyText(text)) ? tr("shareCopied") : "");

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("shareTitle")}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 shadow-2xl sm:rounded-3xl sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[var(--text-primary)]">{tr("shareTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={tr("close")} className="grid h-10 w-10 place-items-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={tr("sharePeriod")}>
          {(["all", ...years] as MiguriPeriod[]).map((value) => (
            <button key={value} type="button" aria-pressed={period === value} onClick={() => onPeriod(value)} className={chip(period === value)}>
              {value === "all" ? tr("periodAll") : tr("periodYear", { year: value })}
            </button>
          ))}
        </div>
        <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={showSpend} onChange={(event) => setShowSpend(event.currentTarget.checked)} className="h-4 w-4 accent-indigo-600" />
          {tr("shareShowSpend")}
        </label>

        <div className="mt-3 grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          {empty ? (
            <p className="text-sm text-[var(--text-tertiary)]">{tr("shareEmpty")}</p>
          ) : failed ? (
            <p role="alert" className="text-sm text-rose-600">{tr("shareFailed")}</p>
          ) : image ? (
            <img src={image.url} alt={text.split("\n").slice(0, 2).join(" ")} className="h-full w-full object-contain" />
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]" role="status">{tr("shareMaking")}</p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={share} disabled={!image} className={`${action} border-transparent bg-indigo-600 text-white hover:bg-indigo-700`}>
            <Share2 size={15} /> {tr("shareImage")}
          </button>
          <button type="button" onClick={() => image && (download(image.blob, filename), setStatus(tr("shareSaved")))} disabled={!image} className={action}>
            <Download size={15} /> {tr("shareSave")}
          </button>
          <button type="button" onClick={copy} disabled={empty} className={action}>
            <Copy size={15} /> {tr("shareCopy")}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={empty}
            className={`${action} ${empty ? "pointer-events-none opacity-40" : ""}`}
          >
            {tr("shareX")}
          </a>
        </div>
        {status ? <p role="status" className="mt-2 text-xs font-semibold text-emerald-600">{status}</p> : null}
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr("shareNote")}</p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr("sharePrivacy")}</p>
      </div>
    </div>
  );
}
