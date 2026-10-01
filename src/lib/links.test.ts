import { describe, expect, it } from 'vitest';
import { formatLink, mediaKind } from './links';

describe('mediaKind', () => {
	it.each([
		['2026/09/a.webp', 'image'],
		['2026/09/a.mp4', 'video'],
		['2026/09/a.MOV', 'video'],
		['2026/09/a.webm', 'video'],
		['2026/09/a.svg', 'image']
	])('%s → %s', (key, kind) => {
		expect(mediaKind(key)).toBe(kind);
	});
});

describe('formatLink', () => {
	const url = 'https://x.dev/i/2026/09/a.webp';

	it('图片', () => {
		expect(formatLink('url', url, 'image', 'cat.jpg')).toBe(url);
		expect(formatLink('markdown', url, 'image', 'cat.jpg')).toBe(`![cat.jpg](${url})`);
		expect(formatLink('html', url, 'image', 'cat.jpg')).toBe(`<img src="${url}" alt="cat.jpg">`);
	});

	it('视频', () => {
		expect(formatLink('markdown', url, 'video', 'clip.mp4')).toBe(`[clip.mp4](${url})`);
		expect(formatLink('html', url, 'video')).toBe(`<video src="${url}" controls></video>`);
	});

	it('转义文件名里的特殊字符', () => {
		expect(formatLink('markdown', url, 'image', 'a [b].png')).toBe(`![a \\[b\\].png](${url})`);
		expect(formatLink('html', url, 'image', '"><script>')).toBe(`<img src="${url}" alt="&quot;&gt;&lt;script&gt;">`);
	});
});
