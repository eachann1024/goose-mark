import type { IconSource } from '@/types/bookmark';
import { fetchAndCacheIcon } from '@/services/iconCache';
export const isHostLikeTitle = (title: string, rawUrl: string) => {
  const normalizedTitle = title.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  if (!normalizedTitle) return false;
  try {
    const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const host = new URL(safeUrl).hostname.toLowerCase().replace(/^www\./, '');
    return normalizedTitle === host;
  } catch {
    return false;
  }
};
export const buildTextIconFromValue = (value: string): IconSource => {
  const base = value.trim();
  const text = base ? base.slice(0, 4).toUpperCase() : '•';
  return {
    type: 'text',
    value: text
  };
};
export const isValidUrlInput = (rawUrl: string) => {
  const input = rawUrl.trim();
  if (!input) return false;
  if (/^javascript:/i.test(input) || /^file:/i.test(input)) return false;
  const candidate = input.replace(/{[^}]+}/g, 'x');
  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
export const toIconSource = (icon: Awaited<ReturnType<typeof fetchAndCacheIcon>>): IconSource | null => {
  if (!icon) return null;
  const nextIcon: Record<string, any> = {
    type: icon.type
  };
  if ('src' in icon && icon.src) nextIcon.src = icon.src;
  if ('path' in icon && icon.path) nextIcon.path = icon.path;
  if ('value' in icon && icon.value) nextIcon.value = icon.value;
  if ('cache' in icon && icon.cache) nextIcon.cache = icon.cache;
  if ('data' in icon && icon.data) nextIcon.data = icon.data;
  if ('bgColor' in icon && icon.bgColor) nextIcon.bgColor = icon.bgColor;
  if ('fetchedAt' in icon && icon.fetchedAt) nextIcon.fetchedAt = icon.fetchedAt;
  return nextIcon as IconSource;
};
