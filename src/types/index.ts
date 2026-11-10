export type ThemeMode = 'dark' | 'light';

export interface HyggshiThemeManager {
  toggle: () => void;
  set: (theme: ThemeMode) => void;
  get: () => ThemeMode;
}

declare global {
  interface Window {
    HyggshiTheme?: HyggshiThemeManager;
    OGL?: any;
  }
}

export interface PostFrontmatter {
  title?: string;
  date?: string;
  category?: string;
  excerpt?: string;
  description?: string;
  cover?: string;
  image?: string;
  [key: string]: string | undefined;
}

export interface Post extends PostFrontmatter {
  content: string;
  slug: string;
}

export interface FrontmatterResult {
  data: Record<string, string>;
  content: string;
}

export type ToastType = 'info' | 'success' | 'warning' | 'error';
