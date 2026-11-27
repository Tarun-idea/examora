export type UiThemeId = 'amethyst-cobalt';

export interface UiThemeDefinition {
  id: UiThemeId;
  name: string;
  subtitle: string;
  badge: string;
  isLight: boolean;
  preview: {
    outerBg: string;
    sidebarBg: string;
    cardBg: string;
    cardBorder: string;
    accentPrimary: string;
    accentSecondary: string;
    textMain: string;
    textMuted: string;
    bars: [string, string, string];
  };
}

export const UI_THEME_STORAGE_KEY = 'examflow_ui_theme_preview';
export const UI_THEME_CHANGE_EVENT = 'examflow:ui-theme-change';

export const UI_THEME_TEMPLATES: UiThemeDefinition[] = [
  {
    id: 'amethyst-cobalt',
    name: 'Amethyst Midnight Dark',
    subtitle: 'Permanent Dark Signature UI',
    badge: 'Active Theme',
    isLight: false,
    preview: {
      outerBg: 'linear-gradient(135deg, #07081B 0%, #0B0E29 55%, #13113C 100%)',
      sidebarBg: '#0A0D27',
      cardBg: '#0E1132',
      cardBorder: 'rgba(168, 85, 247, 0.34)',
      accentPrimary: '#7C3AED',
      accentSecondary: '#22D3EE',
      textMain: '#F8FAFC',
      textMuted: '#A5B4FC',
      bars: ['#8B5CF6', '#A855F7', '#22D3EE'],
    },
  },
];

export const DEFAULT_UI_THEME: UiThemeId = 'amethyst-cobalt';

export function resolveUiTheme(_themeId?: string | null): UiThemeDefinition {
  return UI_THEME_TEMPLATES[0];
}

export function getStoredUiTheme(): UiThemeId {
  return DEFAULT_UI_THEME;
}

export function applyUiThemeToDocument(_themeId?: UiThemeId): UiThemeDefinition {
  const resolved = UI_THEME_TEMPLATES[0];
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-ui-theme', resolved.id);
    document.documentElement.setAttribute('data-theme-mode', 'dark');
    document.documentElement.classList.add('dark');
  }
  return resolved;
}

export function saveStoredUiTheme(_themeId?: UiThemeId): UiThemeDefinition {
  const resolved = applyUiThemeToDocument(DEFAULT_UI_THEME);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, resolved.id);
    } catch {
      // Ignore storage write restrictions
    }
    window.dispatchEvent(
      new CustomEvent(UI_THEME_CHANGE_EVENT, { detail: resolved.id })
    );
  }
  return resolved;
}
