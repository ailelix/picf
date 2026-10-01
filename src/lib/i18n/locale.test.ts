import { describe, expect, it } from 'vitest';
import { negotiateLocale, translate } from './locale';
import { MESSAGES } from './messages';

describe('negotiateLocale', () => {
	it.each([
		['zh-CN,zh;q=0.9,en;q=0.8', 'zh'],
		['zh-TW', 'zh'],
		['en-US,en;q=0.9,zh-CN;q=0.8', 'en'],
		['fr-FR,fr;q=0.9,zh;q=0.5,en;q=0.4', 'zh'],
		['en;q=0.5,zh;q=0.8', 'zh'],
		['zh;q=0,en', 'en'],
		['fr-FR', 'en'],
		['', 'en'],
		[null, 'en']
	])('%j → %s', (header, expected) => {
		expect(negotiateLocale(header)).toBe(expected);
	});
});

describe('translate', () => {
	it('替换参数，未提供的参数保留原样', () => {
		expect(translate('zh', 'error.unknown', { message: 'boom' })).toBe('出错了：boom');
		expect(translate('en', 'error.unknown')).toBe('Something went wrong: {message}');
	});

	it('中英文案的键完全一致且都不为空', () => {
		expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.zh).sort());
		for (const locale of ['zh', 'en'] as const) {
			for (const [key, text] of Object.entries(MESSAGES[locale])) expect(text, `${locale}:${key}`).not.toBe('');
		}
	});
});
