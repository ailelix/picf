import { readFileSync } from 'node:fs';
import Vips from 'wasm-vips';
import { beforeAll, describe, expect, it } from 'vitest';
import { ImagingError } from '../core/errors';
import { probe, type ImageFormat } from '../core/formats';
import type { TransformSpec } from '../core/spec';
import { transformWithVips, type VipsModule } from './vips';

let vips: VipsModule;
beforeAll(async () => {
	vips = await Vips({ dynamicLibraries: ['vips-heif.wasm', 'vips-resvg.wasm'] });
}, 30_000);

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`../core/fixtures/${name}`, import.meta.url)));
const webp: TransformSpec = { format: 'webp', quality: 80 };

/** 输出的帧数：用 vips 按多页方式读取 */
function frames(bytes: Uint8Array) {
	const image = vips.Image.newFromBuffer(bytes, 'n=-1');
	return image.getTypeof('n-pages') ? image.getInt('n-pages') : 1;
}

/** 处理后用 core 的 probe 检查输出 */
function run(input: Uint8Array, format: ImageFormat, spec: TransformSpec) {
	const result = transformWithVips(vips, input, format, spec);
	return { ...result, info: probe(result.bytes) };
}

describe('transformWithVips', () => {
	it.each<[string, ImageFormat]>([
		['photo.jpg', 'jpeg'],
		['still.png', 'png'],
		['still.webp', 'webp'],
		['still.avif', 'avif'],
		['still.tif', 'tiff'],
		['vec.svg', 'svg']
	])('%s → webp', (name, format) => {
		const { info, width, height } = run(fixture(name), format, webp);
		expect(info).toMatchObject({ format: 'webp', width: 30, height: 20 });
		expect({ width, height }).toEqual({ width: 30, height: 20 });
	});

	it.each(['jpeg', 'png', 'avif'] as const)('输出 %s', (format) => {
		const { info } = run(fixture('photo.jpg'), 'jpeg', { ...webp, format });
		expect(info?.format).toBe(format);
	});

	it('scale-down 按比例缩小、不放大', () => {
		expect(run(fixture('photo.jpg'), 'jpeg', { ...webp, width: 15, height: 15 }).info).toMatchObject({
			width: 15,
			height: 10
		});
		expect(run(fixture('photo.jpg'), 'jpeg', { ...webp, width: 300, height: 300 }).info).toMatchObject({
			width: 30,
			height: 20
		});
	});

	it('SVG 按矢量渲染，同样只缩小不放大', () => {
		expect(run(fixture('vec.svg'), 'svg', { ...webp, width: 15 }).info).toMatchObject({ width: 15, height: 10 });
		expect(run(fixture('vec.svg'), 'svg', { ...webp, width: 300 }).info).toMatchObject({ width: 30, height: 20 });
	});

	it('动图转 WebP 保留动画并逐帧缩放', () => {
		const result = run(fixture('anim.gif'), 'gif', { ...webp, width: 15 });
		expect(result.info).toMatchObject({ format: 'webp', width: 15, height: 10 });
		expect(frames(result.bytes)).toBe(2);
		expect({ width: result.width, height: result.height }).toEqual({ width: 15, height: 10 });
	});

	it('输出格式不支持动画时只取第一帧', () => {
		// PNG 只有单页；多帧叠在一起时高度会是 40
		const result = run(fixture('anim.gif'), 'gif', { ...webp, format: 'png' });
		expect(result.info).toMatchObject({ format: 'png', width: 30, height: 20 });
	});

	it('透明图输出 JPEG 时铺白底', () => {
		const transparent = vips.Image.black(4, 4, { bands: 4 }).writeToBuffer('.png');
		const { bytes } = transformWithVips(vips, transparent, 'png', { ...webp, format: 'jpeg', quality: 100 });
		const pixel = vips.Image.newFromBuffer(bytes).getpoint(0, 0);
		expect(pixel.every((v) => v > 250)).toBe(true);
	});

	it('接受浏览器原生解码的 RGBA 像素', () => {
		const data = new Uint8ClampedArray(3 * 2 * 4).fill(255);
		const decoded = transformWithVips(vips, { data, width: 3, height: 2 }, 'bmp', { ...webp, format: 'png' });
		expect(probe(decoded.bytes)).toMatchObject({ format: 'png', width: 3, height: 2 });
	});

	it('去除元数据前把广色域图转换到 sRGB', () => {
		const p3 = vips.Image.newFromBuffer(fixture('still.png')).iccTransform('p3').writeToBuffer('.png');
		expect(vips.Image.newFromBuffer(p3).getTypeof('icc-profile-data')).toBeTruthy();

		const stripped = transformWithVips(vips, p3, 'png', { ...webp, format: 'png' });
		expect(vips.Image.newFromBuffer(stripped.bytes).getTypeof('icc-profile-data')).toBe(0);
	});

	it('quality 影响输出大小', () => {
		const noise = vips.Image.gaussnoise(200, 200).cast('uchar').writeToBuffer('.png');
		const low = transformWithVips(vips, noise, 'png', { ...webp, quality: 10 });
		const high = transformWithVips(vips, noise, 'png', { ...webp, quality: 95 });
		expect(low.bytes.length).toBeLessThan(high.bytes.length);
	});

	it('解码失败抛 ImagingError（wasm-vips 不含 HEVC 解码器）', () => {
		expect(() => transformWithVips(vips, fixture('still.heic'), 'heic', webp)).toThrow(ImagingError);
	});
});
