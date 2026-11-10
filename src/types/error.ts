export type ErrorCategory = 'http' | 'os' | 'system' | 'network' | 'runtime';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorAction {
  label: string;
  href: string;
  primary?: boolean;
  external?: boolean;
}

export interface ErrorDetail {
  code: string;
  numericCode?: number;
  title: string;
  titleEn: string;
  subtitle: string;
  description: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  causes: string[];
  solutions: string[];
  tags: string[];
  suggestedAction?: ErrorAction;
}

export interface ErrorDiagnostics {
  code: string;
  url: string;
  referrer: string;
  timestamp: string;
  userAgent: string;
  language: string;
  platform: string;
  screenResolution: string;
  online: boolean;
}
