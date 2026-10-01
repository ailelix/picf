import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { probe, sniffFormat, type ImageInfo } from './formats';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe('probe：真实文件（TIFF、ICO、HEIC、AVIF、SVG 只识别格式）', () => {
	it.each<[string, Omit<ImageInfo, 'size'>]>([
		['still.png', { format: 'png', width: 30, height: 20 }],
		['photo.jpg', { format: 'jpeg', width: 30, height: 20 }],
		['still.webp', { format: 'webp', width: 30, height: 20 }],
		['anim.webp', { format: 'webp', width: 30, height: 20 }],
		['anim.gif', { format: 'gif', width: 30, height: 20 }],
		['still.avif', { format: 'avif' }],
		['still.heic', { format: 'heic' }],
		['still.tif', { format: 'tiff' }],
		['still.bmp', { format: 'bmp', width: 30, height: 20 }],
		['icon.ico', { format: 'ico' }],
		['vec.svg', { format: 'svg' }]
	])('%s', (name, expected) => {
		const bytes = fixture(name);
		expect(probe(bytes)).toEqual({ ...expected, size: bytes.length });
	});

	it('只有文件开头时仍能识别格式，size 取传入值', () => {
		const bytes = fixture('photo.jpg');
		expect(probe(bytes.subarray(0, 8), 12345)).toEqual({ format: 'jpeg', size: 12345 });
	});
});

describe('sniffFormat：边界情况', () => {
	const bytes = (...parts: (string | number[])[]) =>
		new Uint8Array(
			parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p))
		);
	const u32be = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

	it('无法识别的数据返回 null', () => {
		expect(sniffFormat(new Uint8Array())).toBeNull();
		expect(sniffFormat(bytes('hello world, not an image'))).toBeNull();
		expect(probe(bytes('<html><body>'))).toBeNull();
	});

	it('AVIF 即使兼容品牌里有 mif1 也识别为 avif', () => {
		expect(sniffFormat(bytes(u32be(24), 'ftypmif1', [0, 0, 0, 0], 'mif1avif'))).toBe('avif');
		expect(sniffFormat(bytes(u32be(20), 'ftypmif1', [0, 0, 0, 0], 'heic'))).toBe('heic');
		expect(sniffFormat(bytes(u32be(16), 'ftypisom', [0, 0, 0, 0]))).toBeNull(); // MP4
	});

	it('BMP 必须有合法的 DIB 头长度', () => {
		expect(sniffFormat(bytes('BM', new Array(12).fill(0), [40, 0, 0, 0], new Array(8).fill(0)))).toBe(
			'bmp'
		);
		expect(sniffFormat(bytes('BMW is a car brand, not a bitmap'))).toBeNull();
	});

	it('SVG：允许 BOM、XML 声明、注释、DOCTYPE', () => {
		const svg = (s: string) => sniffFormat(new TextEncoder().encode(s));
		expect(svg('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe('svg');
		expect(svg('\uFEFF  <svg>')).toBe('svg');
		expect(
			svg('<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg [ <!ENTITY a "b"> ]>\n<svg\nwidth="1">')
		).toBe('svg');
		expect(svg('<svgfoo>')).toBeNull();
		expect(svg('<html><svg>')).toBeNull();
	});

	it('大尺寸 PNG 头能正确读出宽高', () => {
		const png = bytes(
			[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
			u32be(13),
			'IHDR',
			u32be(20000),
			u32be(15000)
		);
		expect(probe(png)).toEqual({ format: 'png', size: 24, width: 20000, height: 15000 });
	});
});
