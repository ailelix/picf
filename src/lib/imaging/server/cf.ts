import { ImagingError, type ImagingErrorCode } from '../core/errors';
import { MIME_TYPES } from '../core/formats';
import type { TransformSpec } from '../core/spec';

/** https://developers.cloudflare.com/images/reference/troubleshooting/ */
const CF_ERROR_CODES: Record<number, ImagingErrorCode> = {
	9422: 'QUOTA_EXCEEDED',
	9402: 'TOO_LARGE',
	9413: 'DIMENSIONS_EXCEEDED',
	9522: 'DIMENSIONS_EXCEEDED',
	9412: 'UNSUPPORTED_INPUT',
	9520: 'UNSUPPORTED_INPUT',
	9523: 'UNSUPPORTED_INPUT',
	9432: 'UNAVAILABLE' // 账号还在旧版 Image Resizing 订阅，无法使用 binding
};

export interface TransformResult {
	bytes: Uint8Array;
	contentType: string;
}

/** 只用到 binding 的 input()，测试时可以传入假实现 */
export type ImagesInput = Pick<ImagesBinding, 'input'>;

/**
 * 用 CF Images binding 按 spec 转换图片。任何失败都抛 ImagingError，由调用方决定是否降级。
 * binding 的输出总会去除元数据。
 */
export async function transformWithCf(
	images: ImagesInput,
	input: Uint8Array,
	spec: TransformSpec
): Promise<TransformResult> {
	const mime = MIME_TYPES[spec.format] as ImageOutputOptions['format'];
	let result: ImageTransformationResult;
	let bytes: Uint8Array;
	try {
		let transformer = images.input(new Blob([input as BlobPart]).stream());
		if (spec.width || spec.height) {
			transformer = transformer.transform({
				width: spec.width,
				height: spec.height,
				fit: 'scale-down'
			});
		}
		result = await transformer.output({ format: mime, quality: spec.quality });
		bytes = new Uint8Array(await new Response(result.image()).arrayBuffer());
	} catch (error) {
		throw toImagingError(error);
	}

	// 输出超出限制时 CF 会静默改用其他格式（如 AVIF 超过 1200px），视为失败
	const contentType = result.contentType();
	if (contentType !== mime) {
		throw new ImagingError('UNSUPPORTED_OUTPUT', `CF Images 返回了 ${contentType}，期望 ${mime}`);
	}
	return { bytes, contentType };
}

function toImagingError(error: unknown): ImagingError {
	if (error instanceof ImagingError) return error;
	const cfCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
	const code = (typeof cfCode === 'number' && CF_ERROR_CODES[cfCode]) || 'FAILED';
	const message = error instanceof Error ? error.message : String(error);
	return new ImagingError(code, cfCode ? `CF Images ${cfCode}: ${message}` : message, { cause: error });
}
