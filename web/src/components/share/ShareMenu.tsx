"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

function enc(s: string): string {
  return encodeURIComponent(s);
}

function truncate(s: string, n: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1)).trimEnd()}…`;
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v10" />
      <path d="M8.5 6.5L12 3l3.5 3.5" />
      <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

function BrandIcon({
  name,
  className,
}: {
  name: "x" | "telegram" | "whatsapp" | "facebook" | "linkedin" | "instagram" | "link";
  className?: string;
}) {
  const cn = className ?? "h-4 w-4";
  if (name === "link") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn}
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10.5 4.5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.4a5 5 0 1 0 7.07 7.07L13.5 19.5" />
      </svg>
    );
  }
  if (name === "instagram") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn}
        aria-hidden="true"
        focusable="false"
      >
        <rect x="5" y="5" width="14" height="14" rx="4" />
        <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M16.4 7.6h.01" />
      </svg>
    );
  }
  if (name === "telegram") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn}
        aria-hidden="true"
        focusable="false"
      >
        <path d="M21 5L3.2 11.7c-.8.3-.8 1.4.1 1.6l4.7 1.4 1.7 5.2c.3.9 1.5 1 1.9.2l2.7-4.6 4.9 3.7c.7.5 1.6.1 1.8-.8L22 6.3c.2-.8-.6-1.6-1.4-1.3z" />
        <path d="M8 14l12-9" />
      </svg>
    );
  }
  if (name === "whatsapp") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn}
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20 11.5a8 8 0 0 1-12.8 6.4L4 19l1.2-3.1A8 8 0 1 1 20 11.5z" />
        <path d="M8.8 9.4c.2-.5.4-.5.7-.5h.6c.2 0 .4.1.5.3l.7 1.6c.1.2.1.4 0 .6l-.4.8c-.1.2-.1.4.1.6.5.7 1.2 1.4 2 1.9.2.1.4.1.6 0l.8-.4c.2-.1.4-.1.6 0l1.6.7c.2.1.3.3.3.5v.6c0 .3 0 .5-.5.7-.5.2-1.6.6-3.5-.4-1.9-1-3.4-2.6-4.4-4.4-1-1.9-.6-3-.4-3.5z" />
      </svg>
    );
  }
  if (name === "facebook") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn}
        aria-hidden="true"
        focusable="false"
      >
        <path d="M13.5 21v-7h2.2l.4-2.6h-2.6V9.8c0-.7.4-1.3 1.4-1.3h1.3V6.1c-.2 0-1.1-.2-2.2-.2-2.3 0-3.8 1.4-3.8 3.9V11H8v2.6h2.2v7h3.3z" />
      </svg>
    );
  }
  if (name === "linkedin") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn}
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6.6 10.1H3.7V20h2.9v-9.9zM5.1 3.9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM20.3 20h-2.9v-5.3c0-1.3 0-3-1.8-3-1.8 0-2.1 1.4-2.1 2.9V20h-2.9v-9.9H13v1.4h.1c.4-.7 1.4-1.4 2.8-1.4 3 0 3.6 2 3.6 4.5V20z" />
      </svg>
    );
  }
  // X
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.7 3H21l-6.6 7.6L22 21h-6.2l-4-5-4.4 5H3l7.1-8.2L2 3h6.3l3.6 4.5L18.7 3zm-1.1 16h1.3L8.4 4.9H7.1L17.6 19z" />
    </svg>
  );
}

export default function ShareMenu({
  path,
  title,
  body,
  variant = "icon",
}: {
  path: string; // e.g. /t/foo/e/uuid
  title?: string | null;
  body?: string | null;
  variant?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const shareText = useMemo(() => {
    const headline = title ? String(title).trim() : "";
    const snippet = truncate(body ?? "", 140);
    const core = headline || snippet || "View this post on Rekord.";
    return truncate(core, 180);
  }, [title, body]);

  useEffect(() => {
    try {
      setUrl(`${window.location.origin}${path}`);
    } catch {
      setUrl(path);
    }
  }, [path]);

  useEffect(() => {
    function onDocClick() {
      setOpen(false);
    }
    if (!open) return;
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  useEffect(() => {
    function onWindowChange() {
      if (!open) return;
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    if (!open) return;
    onWindowChange();
    window.addEventListener("scroll", onWindowChange, { passive: true });
    window.addEventListener("resize", onWindowChange);
    return () => {
      window.removeEventListener("scroll", onWindowChange);
      window.removeEventListener("resize", onWindowChange);
    };
  }, [open]);

  const canWebShare = typeof navigator !== "undefined" && Boolean((navigator as any).share);

  const xHref = `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(url)}`;
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;
  const waHref = `https://api.whatsapp.com/send?text=${enc(`${shareText} ${url}`)}`;
  const tgHref = `https://t.me/share/url?url=${enc(url)}&text=${enc(shareText)}`;
  const igHref = "https://www.instagram.com/";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  async function webShare() {
    try {
      await (navigator as any).share({
        title: title ? String(title) : "Rekord",
        text: shareText,
        url,
      });
    } catch {
      // cancelled
    }
  }

  async function shareInstagram() {
    // Instagram doesn't support a reliable prefilled web share.
    // Best-effort: copy link and open Instagram.
    await copyLink();
    try {
      window.open(igHref, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  }

  const buttonClass =
    variant === "icon"
      ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-400/30 bg-zinc-950/20 text-xs font-semibold text-zinc-200 hover:bg-zinc-950/30"
      : "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/10";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className={buttonClass}
        title="Share"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const el = btnRef.current;
          if (el) {
            const r = el.getBoundingClientRect();
            setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
          }
          setOpen((v) => !v);
        }}
        disabled={!url}
      >
        {variant === "icon" ? (
          <ShareIcon className="h-4 w-4" />
        ) : (
          <span className="inline-flex items-center gap-2">
            <ShareIcon className="h-4 w-4" />
            Share
          </span>
        )}
      </button>

      {open ? (
        createPortal(
          <div
            className="fixed inset-0 z-[200]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-hidden
          >
            <div
              className="fixed z-[201] w-56 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 p-2 text-sm text-zinc-100 shadow-2xl backdrop-blur"
              style={{
                top: pos?.top ?? 0,
                right: pos?.right ?? 8,
              }}
              onClick={(e) => {
                // Allow clicks on links/buttons inside the menu to work.
                e.stopPropagation();
              }}
              role="dialog"
              aria-label="Share menu"
            >
              <div className="px-2 py-1 text-xs font-semibold text-zinc-300">Share</div>

              <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
                {canWebShare ? (
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                    onClick={() => {
                      setOpen(false);
                      void webShare();
                    }}
                    aria-label="Share…"
                    title="Share…"
                  >
                    <ShareIcon className="h-4 w-4" />
                  </button>
                ) : null}

                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  onClick={() => void copyLink()}
                  aria-label="Copy link"
                  title="Copy link"
                >
                  <BrandIcon name="link" className="h-4 w-4" />
                </button>

                <a
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  href={xHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on X"
                  title="X"
                >
                  <BrandIcon name="x" className="h-4 w-4" />
                </a>
                <a
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  href={tgHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on Telegram"
                  title="Telegram"
                >
                  <BrandIcon name="telegram" className="h-4 w-4" />
                </a>
                <a
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on WhatsApp"
                  title="WhatsApp"
                >
                  <BrandIcon name="whatsapp" className="h-4 w-4" />
                </a>
                <a
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  href={fbHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on Facebook"
                  title="Facebook"
                >
                  <BrandIcon name="facebook" className="h-4 w-4" />
                </a>
                <a
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  href={liHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on LinkedIn"
                  title="LinkedIn"
                >
                  <BrandIcon name="linkedin" className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  onClick={() => void shareInstagram()}
                  aria-label="Share on Instagram (copies link)"
                  title="Instagram (copies link)"
                >
                  <BrandIcon name="instagram" className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 px-2 pb-1 text-[11px] text-zinc-400">
                {copied ? "Link copied. Paste into your post/story." : "Shares a link back to Rekord."}
              </div>
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}

