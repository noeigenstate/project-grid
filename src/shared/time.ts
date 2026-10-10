import { currentLanguage, t } from './i18n';

// How long ago something happened, the way the cards say it.
export function relativeTime(timestamp: number | null, now: number) {
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return t('刚刚');
  if (seconds < 60) return t('{n} 秒前', { n: seconds });
  if (seconds < 3600) return t('{n} 分钟前', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('{n} 小时前', { n: Math.floor(seconds / 3600) });
  return new Date(timestamp).toLocaleDateString(currentLanguage() === 'en' ? 'en-US' : 'zh-CN');
}
