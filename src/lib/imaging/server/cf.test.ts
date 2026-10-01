import { describe, expect, it } from 'vitest';
import { ImagingError } from '../core/errors';
import type { TransformSpec } from '../core/spec';
import { transformWithCf, type ImagesInput } from './cf';

/** 记录调用参数的假 binding */
function fakeImages(opts: { contentType?: string; error?: unknown } = {}) {
	const calls: { transform?: ImageTransform; output?: ImageOutputOptions } = {};
	const transformer = {
		transform(t: ImageTransform) {
			calls.transform = t;
			return transformer;
		},
		async output(o: ImageOutputOptions) {
			calls.output = o;
			if (opts.error) throw opts.error;
			return {
				contentType: () => opts.contentType ?? o.format,
				image: () => new Blob([new Uint8Array([1, 2, 3])]).stream()
			};
		}
	};
	const images = { input: () => transformer } as unknown as ImagesInput;
	return { images, calls };
}

const spec: TransformSpec = { format: 'webp', quality: 80 };
const input = new Uint8Array([0xff, 0xd8, 0xff]);

describe('transformWithCf', () => {
	it('不缩放时不调用 transform，输出参数与 spec 对应', async () => {
		const { images, calls } = fakeImages();
		const result = await transformWithCf(images, input, spec);
		expect(result).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp' });
		expect(calls.transform).toBeUndefined();
		expect(calls.output).toEqual({ format: 'image/webp', quality: 80 });
	});

	it('缩放参数原样传给 CF，fit 固定为 scale-down', async () => {
		const { images, calls } = fakeImages();
		await transformWithCf(images, input, { ...spec, width: 1200, height: 1200 });
		expect(calls.transform).toEqual({ width: 1200, height: 1200, fit: 'scale-down' });
		expect(calls.output).toEqual({ format: 'image/webp', quality: 80 });
	});

	it('CF 静默换了输出格式时视为失败', async () => {
		const { images } = fakeImages({ contentType: 'image/webp' });
		await expect(transformWithCf(images, input, { ...spec, format: 'avif' })).rejects.toMatchObject({
			code: 'UNSUPPORTED_OUTPUT'
		});
	});

	it.each([
		[9422, 'QUOTA_EXCEEDED'],
		[9413, 'DIMENSIONS_EXCEEDED'],
		[9520, 'UNSUPPORTED_INPUT'],
		[9432, 'UNAVAILABLE'],
		[9999, 'FAILED']
	])('CF 错误码 %i 映射为 %s', async (cfCode, code) => {
		const { images } = fakeImages({ error: Object.assign(new Error('boom'), { code: cfCode }) });
		const error = await transformWithCf(images, input, spec).catch((e) => e);
		expect(error).toBeInstanceOf(ImagingError);
		expect(error).toMatchObject({ code, message: `CF Images ${cfCode}: boom` });
	});

	it('没有错误码的异常映射为 FAILED', async () => {
		const { images } = fakeImages({ error: new TypeError('network') });
		await expect(transformWithCf(images, input, spec)).rejects.toMatchObject({ code: 'FAILED' });
	});
});
