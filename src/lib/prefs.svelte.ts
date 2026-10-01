/** 界面偏好（语言、主题）。常量和函数也会被服务端 hooks 用到 */
import { createContext } from 'svelte';
import { LOCALE_COOKIE, translate, type Locale } from '$lib/i18n/locale';
import type { MessageKey } from '$lib/i18n/messages';

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

/**
 * 当前语言和主题。每次渲染由根布局创建一份并放进 context，
 * 不能放在模块级变量里：服务端同一个 Worker 实例会处理多个用户的请求。
 */
export class Preferences {
	locale = $state<Locale>('en');
	theme = $state<Theme>('auto');

	constructor(locale: Locale, theme: Theme) {
		this.locale = locale;
		this.theme = theme;
	}

	/** 在模板里调用时会随语言切换自动更新 */
	t = (key: MessageKey, params?: Record<string, string | number>) => translate(this.locale, key, params);

	toggleLocale() {
		this.locale = this.locale === 'zh' ? 'en' : 'zh';
		document.documentElement.lang = htmlLang(this.locale);
		saveCookie(LOCALE_COOKIE, this.locale);
	}

	/** 跟随系统 → 浅色 → 深色 → 跟随系统 */
	cycleTheme() {
		this.theme = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
		const root = document.documentElement;
		if (this.theme === 'auto') root.removeAttribute('data-theme');
		else root.dataset.theme = this.theme;
		saveCookie(THEME_COOKIE, this.theme);
	}
}

/** 偏好用 cookie 保存一年，这样服务端渲染时就能输出正确的语言和主题，页面不会闪烁 */
function saveCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
}

export const [getPrefs, setPrefs] = createContext<Preferences>();
