import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, objectKey, OBJECT_KEY_PATTERN, publicUrl } from './images';

describe('normalizeBaseUrl', () => {
	it.each([
		['https://img.example.com', 'https://img.example.com'],
		['https://img.example.com/', 'https://img.example.com'],
		['img.example.com', 'https://img.example.com'],
		['  https://img.example.com//  ', 'https://img.example.com'],
		['https://cdn.example.com/picf/', 'https://cdn.example.com/picf'],
		['http://localhost:8787', 'http://localhost:8787']
	])('%j → %s', (input, expected) => {
		expect(normalizeBaseUrl(input)).toBe(expected);
	});

	it.each([undefined, '', '   '])('未配置：%j', (input) => {
		expect(normalizeBaseUrl(input)).toBeNull();
	});

	it.each(['ftp://img.example.com', 'https://', 'not a url with spaces'])('非法值：%j', (input) => {
		expect(normalizeBaseUrl(input)).toBeNull();
	});
});

describe('objectKey', () => {
	// 2026-09-28 20:30 UTC，即北京时间 2026-09-29 04:30
	const date = new Date(Date.UTC(2026, 8, 28, 20, 30));

	it('路径为 年/月/日/随机ID.扩展名，默认按 UTC', () => {
		expect(objectKey('abc123', 'webp', { date })).toBe('2026/09/28/abc123.webp');
	});

	it('按指定时区计算日期', () => {
		expect(objectKey('abc123', 'webp', { date, timeZone: 'Asia/Shanghai' })).toBe('2026/09/29/abc123.webp');
		expect(objectKey('abc123', 'webp', { date, timeZone: 'America/Los_Angeles' })).toBe('2026/09/28/abc123.webp');
	});

	it('生成的路径符合 OBJECT_KEY_PATTERN', () => {
		expect(OBJECT_KEY_PATTERN.test(objectKey('abc123', 'mp4'))).toBe(true);
	});
});

describe('publicUrl', () => {
	it('R2 路径拼在公共域名后', () => {
		expect(publicUrl('https://img.example.com', '2026/09/29/abc123.webp')).toBe(
			'https://img.example.com/2026/09/29/abc123.webp'
		);
	});
});

describe('OBJECT_KEY_PATTERN', () => {
	it.each(['2026/09/29/abc.webp', '2026/09/29/abc.mp4', '2026/09/29/ABC123.jpg'])('合法：%s', (key) => {
		expect(OBJECT_KEY_PATTERN.test(key)).toBe(true);
	});

	const invalid = ['../etc/passwd', '2026/09/abc.webp', '2026/09/29/a.b.webp', '2026/9/29/abc.webp', '2026/09/29/abc'];
	it.each(invalid)('非法：%s', (key) => {
		expect(OBJECT_KEY_PATTERN.test(key)).toBe(false);
	});
});
