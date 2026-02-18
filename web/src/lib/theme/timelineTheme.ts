export type TimelineThemeColors = {
  primary: string; // card background
  secondary: string; // rails/lines/drawing accents
  text: string; // themed label text
};

export function themeDefaultsForSlug(slug: string): TimelineThemeColors {
  if (slug === "iran-uprise-2026") {
    return {
      primary: "#f0fdf4", // soft green
      secondary: "#16a34a", // green
      text: "#052e16", // deep green
    };
  }

  // Neutral default
  return {
    primary: "#ffffff",
    secondary: "#64748b", // slate-500
    text: "#0f172a", // slate-900
  };
}

export function themeColorsFromTimeline(
  timeline: { slug: string; theme_primary?: string; theme_secondary?: string; theme_text?: string } | null,
): TimelineThemeColors {
  if (!timeline) return themeDefaultsForSlug("default");
  const fallback = themeDefaultsForSlug(timeline.slug);
  const p = String(timeline.theme_primary ?? "").trim();
  const s = String(timeline.theme_secondary ?? "").trim();
  const t = String(timeline.theme_text ?? "").trim();
  return {
    primary: p || fallback.primary,
    secondary: s || fallback.secondary,
    text: t || fallback.text,
  };
}

export function cssVarsForTimelineThemeColors(colors: TimelineThemeColors): Record<string, string> {
  // Keep some legacy var names to minimize component churn.
  return {
    "--tl-primary": colors.primary,
    "--tl-secondary": colors.secondary,
    "--tl-text": colors.text,

    "--tl-card-bg": "var(--tl-primary)",
    "--tl-card-bg-dark": "var(--tl-primary)",
    "--tl-rail": "var(--tl-secondary)",
    "--tl-accent": "var(--tl-secondary)",
    "--tl-accent2": "var(--tl-secondary)",

    // Badges: slightly “lifted” from primary for contrast.
    "--tl-badge-bg": "color-mix(in oklab, var(--tl-primary) 78%, white)",
    "--tl-badge-bg-dark": "color-mix(in oklab, var(--tl-primary) 35%, rgb(24,24,27))",
    "--tl-badge-fg": "var(--tl-text)",
    "--tl-badge-fg-dark": "var(--tl-text)",
  };
}

