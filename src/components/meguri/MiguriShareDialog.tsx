import { useEffect, useState } from "react";
import { Copy, Download, ImageIcon, Share2, X } from "lucide-react";
import type { MiguriTranslate } from "@/i18n/miguri";
import { copyText, shareOrDownloadImage } from "../seichi/route-share";
import {
  MIGURI_SHARE_STYLES,
  miguriShareText,
  renderMiguriShareImage,
  resolveMiguriShareStyle,
  type MiguriPeriod,
  type MiguriShareCard,
  type MiguriShareStyle,
  type MiguriShareStyleId,
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

/** Images can't be attached through a web post link, so the PNG goes on the clipboard for pasting into the composer. */
async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

const STYLE_KEY = "miguri-share-style";
const STYLE_LABELS = { auto: "styleAuto", sakura: "styleSakura", nogi: "styleNogi", hinata: "styleHinata", receipt: "styleReceipt", forest: "styleForest", sunny: "styleSunny", swiss: "styleSwiss", night: "styleNight" } as const;
const STYLE_DOTS: Record<MiguriShareStyleId, string> = { sakura: "#d6456b", nogi: "#7a2a8c", hinata: "#0a8fd0", receipt: "#161616", forest: "#124036", sunny: "#ffdc4a", swiss: "#e30613", night: "#1b181a" };

function savedStyle(): MiguriShareStyle {
  try {
    const value = localStorage.getItem(STYLE_KEY);
    return value === "auto" || (MIGURI_SHARE_STYLES as readonly string[]).includes(value ?? "") ? (value as MiguriShareStyle) : "auto";
  } catch {
    return "auto";
  }
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
  const [style, setStyle] = useState<MiguriShareStyle>("auto");
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const text = miguriShareText(card, showSpend);
  const filename = `46log-miguri-${period}.png`;

  useEffect(() => setStyle(savedStyle()), []);
  const pickStyle = (value: MiguriShareStyle) => {
    setStyle(value);
    try {
      localStorage.setItem(STYLE_KEY, value);
    } catch {
      /* the choice just isn't remembered */
    }
  };

  useEffect(() => {
    setImage(null);
    setFailed(false);
    setStatus("");
    if (empty) return;
    let alive = true;
    let url = "";
    renderMiguriShareImage(card, showSpend, style)
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
  }, [card, showSpend, style, empty]);

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
  const copyPicture = async () => {
    if (image) setStatus((await copyImage(image.blob)) ? tr("shareImageCopied") : tr("shareImageCopyFailed"));
  };
  // Open the composer first (needs the click), then put the picture on the clipboard: paste it into the post box.
  const post = async (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    if (image) setStatus((await copyImage(image.blob)) ? tr("sharePasteHint") : tr("shareImageCopyFailed"));
  };

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
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={tr("shareStyle")}>
          {(["auto", ...MIGURI_SHARE_STYLES] as MiguriShareStyle[]).map((value) => (
            <button key={value} type="button" aria-pressed={style === value} onClick={() => pickStyle(value)} className={`${chip(style === value)} inline-flex items-center gap-1.5`}>
              <span aria-hidden className="h-3 w-3 rounded-full border border-black/15" style={{ background: STYLE_DOTS[value === "auto" ? resolveMiguriShareStyle("auto", card) : value] }} />
              {tr(STYLE_LABELS[value])}
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
          <button type="button" onClick={copyPicture} disabled={!image || !("ClipboardItem" in window)} className={action}>
            <ImageIcon size={15} /> {tr("shareCopyImage")}
          </button>
          <button type="button" onClick={() => post(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`)} disabled={!image} className={action}>
            {tr("shareX")}
          </button>
          <button type="button" onClick={() => post(`https://service.weibo.com/share/share.php?title=${encodeURIComponent(text)}`)} disabled={!image} className={action}>
            {tr("shareWeibo")}
          </button>
        </div>
        {status ? <p role="status" className="mt-2 text-xs font-semibold text-emerald-600">{status}</p> : null}
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr("shareNote")}</p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr("sharePrivacy")}</p>
      </div>
    </div>
  );
}
