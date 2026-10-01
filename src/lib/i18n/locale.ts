import { MESSAGES, type MessageKey } from './messages';

export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
	return LOCALES.includes(value as Locale);
}

/** 取 Accept-Language 中第一个支持的语言（浏览器已按偏好排序），都不支持时用英文 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
	for (const part of (acceptLanguage ?? '').split(',')) {
		const base = part.trim().split(/[-;]/)[0].toLowerCase();
		if (isLocale(base)) return base;
	}
	return 'en';
}

export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
	const text = MESSAGES[locale][key];
	return params ? text.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match)) : text;
}
