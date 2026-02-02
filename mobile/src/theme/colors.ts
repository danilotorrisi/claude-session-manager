export const colors = {
  // Backgrounds
  background: "#0A0F1A",
  surface: "#101729",
  surfaceLight: "#1A2035",
  card: "#131B2E",

  // Brand
  primary: "#164e63",
  primaryLight: "#1e6e8a",
  accent: "#22d3ee",

  // Semantic
  success: "#34D399",
  successDim: "#1a3a2a",
  warning: "#FBBF24",
  warningDim: "#3a3020",
  danger: "#F87171",
  dangerDim: "#3b1a1a",

  // Text hierarchy
  textPrimary: "#FFFFFF",
  textSecondary: "#CBD5E1",
  textMuted: "#64748B",
  textDim: "#475569",

  // Borders & separators
  border: "#334155",
  borderLight: "#475569",
  separator: "#1E293B",

  // Claude state tints
  claudeIdle: {
    bg: "#1a2e1a",
    text: "#34D399",
    dot: "#34D399",
  },
  claudeWorking: {
    bg: "#1a2040",
    text: "#60A5FA",
    dot: "#60A5FA",
  },
  claudeWaiting: {
    bg: "#3b1a1a",
    text: "#FBBF24",
    dot: "#FBBF24",
  },

  // Worker status
  online: "#34D399",
  stale: "#FBBF24",
  offline: "#64748B",

  // Tab bar
  tabBar: "#0D1220",
  tabActive: "#22d3ee",
  tabInactive: "#64748B",
} as const;
