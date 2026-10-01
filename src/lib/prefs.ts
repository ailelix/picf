/** 界面偏好（语言、主题）的共用常量，服务端 hooks 和浏览器都会用到 */
import type { Locale } from '$lib/i18n/locale';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'theme';

export function isTheme(value: unknown): value is Theme {
	return THEMES.includes(value as Theme);
}

/** <html lang> 的取值 */
export function htmlLang(locale: Locale): string {
	return locale === 'zh' ? 'zh-CN' : 'en';
}

/** 偏好用 cookie 保存，这样服务端渲染时就能输出正确的语言和主题，页面不会闪烁 */
export const PREF_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
