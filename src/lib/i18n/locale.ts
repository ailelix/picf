import { MESSAGES, type MessageKey } from './messages';

export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
	return LOCALES.includes(value as Locale);
}

/** 按 Accept-Language 的权重挑出第一个支持的语言，都不支持时用英文 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
	const ranked = (acceptLanguage ?? '')
		.split(',')
		.map((part, index) => {
			const [tag, ...params] = part.trim().toLowerCase().split(';');
			const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
			return { tag, q: q ? Number(q.slice(2)) : 1, index };
		})
		.filter((l) => l.tag && l.q > 0)
		.sort((a, b) => b.q - a.q || a.index - b.index);

	for (const { tag } of ranked) {
		const base = tag.split('-')[0];
		if (isLocale(base)) return base;
	}
	return 'en';
}

export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
	const text = MESSAGES[locale][key];
	return params ? text.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match)) : text;
}
