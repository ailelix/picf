import type Vips from 'wasm-vips';
import { ImagingError } from '../core/errors';
import type { ImageFormat, OutputFormat } from '../core/formats';
import type { TransformSpec } from '../core/spec';

export type VipsModule = Awaited<ReturnType<typeof Vips>>;
type VipsImage = InstanceType<VipsModule['Image']>;

/** 浏览器原生解码得到的 RGBA 像素（已按 EXIF 方向转正、转换到 sRGB） */
export interface DecodedPixels {
	data: Uint8ClampedArray | Uint8Array;
	width: number;
	height: number;
}

export interface WasmResult {
	bytes: Uint8Array;
	width: number;
	/** 动图为单帧高度 */
	height: number;
}

/** 输入格式里可能是动图、vips 加载时支持 n 参数的 */
const ANIMATED_INPUTS = new Set<ImageFormat>(['gif', 'webp']);
/** 能保存动画的输出格式 */
const ANIMATED_OUTPUTS = new Set<OutputFormat>(['webp']);
/** 没有指定宽高时用这个作为缩放框，配合 size: 'down' 即不缩放 */
const NO_LIMIT = 10_000_000;

/**
 * 按 spec 处理图片，语义与 CF Images 保持一致：
 * - 只缩小不放大
 * - 输入是动图且输出格式支持动画时保留动画，否则取第一帧
 * - 转换到 sRGB 后去除全部元数据
 * - 透明图输出 JPEG 时铺白底
 */
export function transformWithVips(
	vips: VipsModule,
	input: Uint8Array | DecodedPixels,
	format: ImageFormat,
	spec: TransformSpec
): WasmResult {
	const images: VipsImage[] = [];
	const track = (image: VipsImage) => (images.push(image), image);

	try {
		const width = spec.width ?? NO_LIMIT;
		const options = { height: spec.height ?? NO_LIMIT, size: 'down' };

		let image: VipsImage;
		if (input instanceof Uint8Array) {
			const keepFrames = ANIMATED_INPUTS.has(format) && ANIMATED_OUTPUTS.has(spec.format);
			image = track(
				vips.Image.thumbnailBuffer(input, width, { ...options, option_string: keepFrames ? 'n=-1' : '' })
			);
		} else {
			const { buffer, byteOffset, byteLength } = input.data;
			const pixels = new Uint8Array(buffer, byteOffset, byteLength); // 同一块内存的视图，不复制
			const raw = track(vips.Image.newFromMemory(pixels, input.width, input.height, 4, vips.BandFormat.uchar));
			const srgb = track(raw.copy({ interpretation: 'srgb' }));
			image = track(srgb.thumbnailImage(width, options));
		}

		if (image.getTypeof('icc-profile-data')) {
			// 去掉 ICC 之前先转换到 sRGB，否则广色域（如 iPhone 的 Display P3）照片会偏色
			image = track(image.iccTransform('srgb'));
		}
		if (spec.format === 'jpeg' && image.hasAlpha()) {
			image = track(image.flatten({ background: [255, 255, 255] }));
		}

		const bytes = image.writeToBuffer(`.${spec.format === 'jpeg' ? 'jpg' : spec.format}`, encoderOptions(spec));
		const pageHeight = image.getTypeof('page-height') ? image.getInt('page-height') : image.height;
		return { bytes, width: image.width, height: pageHeight };
	} catch (error) {
		if (error instanceof ImagingError) throw error;
		throw new ImagingError('FAILED', `wasm-vips 处理失败：${messageOf(error)}`, { cause: error });
	} finally {
		for (const image of images) image.delete();
	}
}

function encoderOptions(spec: TransformSpec): Record<string, unknown> {
	const common = { keep: 'none' };
	switch (spec.format) {
		case 'webp':
			return { ...common, Q: spec.quality };
		case 'avif':
			return { ...common, Q: spec.quality };
		case 'jpeg':
			// 与 CF 一致输出渐进式 JPEG
			return { ...common, Q: spec.quality, interlace: true, optimize_coding: true };
		case 'png':
			return common; // PNG 无损，quality 不适用
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
