// src/theme.ts
// Canonical design tokens for BolusBrain.
// Background is locked: #050706 (per D-03 in Phase 4 CONTEXT.md).
// Other values are discretionary — chosen for OLED contrast and legibility.

export const COLORS = {
  background: '#050706',    // locked — deep near-black for OLED
  surface: '#1A1A1C',       // card backgrounds (slightly lighter than background)
  surfaceRaised: '#2C2C2E', // elevated surfaces (stats rows, nested cards)
  text: '#FFFFFF',          // primary text
  textSecondary: '#8E8E93', // secondary labels, units
  textMuted: '#636366',     // muted/tertiary text (dates, hints)
  green: '#30D158',         // in-range glucose
  amber: '#FF9500',         // high glucose / elevated
  red: '#FF3B30',           // low glucose / hypo
  blue: '#0A84FF',          // insulin, actions
  separator: '#2C2C2E',     // dividers
} as const;

export const FONTS = {
  // Outfit — used for all UI text (labels, names, descriptions)
  regular: 'Outfit_400Regular',
  semiBold: 'Outfit_600SemiBold',
  // JetBrains Mono — used for glucose numbers only
  mono: 'JetBrainsMono_400Regular',
} as const;
