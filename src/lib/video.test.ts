import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sniffVideo } from './video';

const fixture = (path: string) => new Uint8Array(readFileSync(new URL(path, import.meta.url)));

describe('sniffVideo', () => {
	it.each([
		['clip.mp4', 'mp4'],
		['clip.webm', 'webm'],
		['clip.mov', 'mov']
	])('%s → %s', (name, format) => {
		expect(sniffVideo(fixture(`./fixtures/${name}`))).toBe(format);
	});

	it('Matroska（.mkv）不接受', () => {
		expect(sniffVideo(fixture('./fixtures/clip.mkv'))).toBeNull();
	});

	it('HEIC/AVIF 虽然也以 ftyp 开头，但不是视频', () => {
		expect(sniffVideo(fixture('./imaging/core/fixtures/still.heic'))).toBeNull();
		expect(sniffVideo(fixture('./imaging/core/fixtures/still.avif'))).toBeNull();
	});

	it('没有 ftyp 的老式 QuickTime', () => {
		const legacy = new Uint8Array([0, 0, 0, 8, ...[...'moov'].map((c) => c.charCodeAt(0))]);
		expect(sniffVideo(legacy)).toBe('mov');
	});

	it('只看文件开头即可识别', () => {
		expect(sniffVideo(fixture('./fixtures/clip.webm').subarray(0, 48))).toBe('webm');
	});

	it.each([new Uint8Array(), new TextEncoder().encode('hello world, not a video')])('其他数据返回 null', (bytes) => {
		expect(sniffVideo(bytes)).toBeNull();
	});
});
