import { describe, expect, it } from 'vitest';
import type { ImageInfo } from './formats';
import { plan, type PlanContext } from './planner';
import { DEFAULT_IMAGING_SETTINGS, type ImagingSettings } from './settings';

const MB = 1024 * 1024;
const browser: PlanContext = { cfEnabled: true, wasmAvailable: true };
const api: PlanContext = { cfEnabled: true, wasmAvailable: false };

const img = (info: Partial<ImageInfo> & Pick<ImageInfo, 'format'>): ImageInfo => ({
	size: MB,
	width: 4000,
	height: 3000,
	...info
});
const settings = (patch: Partial<ImagingSettings>): ImagingSettings =>
	({ ...DEFAULT_IMAGING_SETTINGS, ...patch });

describe('plan', () => {
	it('设置为不转换的格式原样保存', () => {
		expect(plan(img({ format: 'gif' }), DEFAULT_IMAGING_SETTINGS, browser)).toEqual({
			kind: 'store',
			reason: 'NO_CONVERSION'
		});
	});

	it('CF 能处理时优先 CF，WASM 作为后备', () => {
		expect(plan(img({ format: 'jpeg' }), DEFAULT_IMAGING_SETTINGS, browser)).toEqual({
			kind: 'transform',
			spec: { format: 'webp', quality: 80 },
			engines: ['cf', 'wasm'],
			rejected: []
		});
	});

	it('HEIC 只有 CF 能处理', () => {
		expect(plan(img({ format: 'heic' }), DEFAULT_IMAGING_SETTINGS, browser)).toMatchObject({
			engines: ['cf'],
			rejected: [{ engine: 'wasm', code: 'UNSUPPORTED_INPUT' }]
		});
	});

	it.each(['tiff', 'bmp', 'avif', 'ico', 'svg'] as const)('%s 不是 CF 的输入格式，直接走 WASM', (format) => {
		const s = settings({ convert: [format] });
		expect(plan(img({ format }), s, browser)).toMatchObject({
			kind: 'transform',
			engines: ['wasm'],
			rejected: [{ engine: 'cf', code: 'UNSUPPORTED_INPUT' }]
		});
	});

	it('超过 20MB 跳过 CF', () => {
		expect(plan(img({ format: 'jpeg', size: 21 * MB }), DEFAULT_IMAGING_SETTINGS, browser)).toMatchObject({
			engines: ['wasm'],
			rejected: [{ engine: 'cf', code: 'TOO_LARGE' }]
		});
	});

	it('超过 12000px 或 100MP 跳过 CF', () => {
		for (const [width, height] of [
			[13000, 100],
			[10001, 10000]
		]) {
			expect(plan(img({ format: 'png', width, height }), DEFAULT_IMAGING_SETTINGS, browser)).toMatchObject({
				engines: ['wasm'],
				rejected: [{ engine: 'cf', code: 'DIMENSIONS_EXCEEDED' }]
			});
		}
	});

	it('输出 AVIF：目标尺寸超过 1200px 跳过 CF，缩到 1200 以内则可以用 CF', () => {
		const toAvif = { convertTo: 'avif' } as const;
		expect(plan(img({ format: 'jpeg' }), settings(toAvif), browser)).toMatchObject({
			engines: ['wasm'],
			rejected: [{ engine: 'cf', code: 'DIMENSIONS_EXCEEDED' }]
		});
		expect(plan(img({ format: 'jpeg' }), settings({ ...toAvif, maxEdge: 1200 }), browser)).toMatchObject({
			spec: { format: 'avif', width: 1200, height: 1200 },
			engines: ['cf', 'wasm']
		});
	});

	it('宽高未知时不拦截 CF，交给运行时降级', () => {
		const info = img({ format: 'jpeg', width: undefined, height: undefined });
		const toAvif = settings({ convertTo: 'avif' });
		expect(plan(info, toAvif, browser)).toMatchObject({ engines: ['cf', 'wasm'] });
	});

	it('CF 关闭时只用 WASM', () => {
		expect(plan(img({ format: 'jpeg' }), DEFAULT_IMAGING_SETTINGS, { ...browser, cfEnabled: false })).toMatchObject(
			{ engines: ['wasm'], rejected: [{ engine: 'cf', code: 'UNAVAILABLE' }] }
		);
	});

	it('API 上传且 CF 处理不了时原样保存', () => {
		expect(plan(img({ format: 'tiff' }), DEFAULT_IMAGING_SETTINGS, api)).toEqual({
			kind: 'store',
			reason: 'NO_ENGINE',
			rejected: [
				{ engine: 'cf', code: 'UNSUPPORTED_INPUT' },
				{ engine: 'wasm', code: 'UNAVAILABLE' }
			]
		});
	});

	it('使用全局 quality', () => {
		expect(plan(img({ format: 'png' }), settings({ quality: 70 }), browser)).toMatchObject({ spec: { quality: 70 } });
	});
});
