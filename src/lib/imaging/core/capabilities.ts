import type { ImagingErrorCode } from './errors';
import type { ImageFormat, ImageInfo, OutputFormat } from './formats';
import { targetSize, type TransformSpec } from './spec';

export type EngineName = 'cf' | 'wasm';

export interface EngineCapabilities {
	input: ReadonlySet<ImageFormat>;
	output: ReadonlySet<OutputFormat>;
	maxBytes?: number;
	/** 输入的最长边 */
	maxEdge?: number;
	/** 输入的面积（像素数） */
	maxArea?: number;
	/** 各输出格式的最长边上限 */
	maxOutputEdge?: Partial<Record<OutputFormat, number>>;
}

/**
 * https://developers.cloudflare.com/images/get-started/limits/
 * - AVIF 输入仅 Enterprise 可用；SVG 只做清理、不做变换，所以都不算在输入里
 * - AVIF 输出超过 1200px 时 CF 会静默改用 WebP/JPEG，视为不支持
 * - binding 的输出总会去除元数据，与 WASM 端的处理一致
 */
export const CF_IMAGES: EngineCapabilities = {
	input: new Set(['png', 'jpeg', 'gif', 'webp', 'heic']),
	output: new Set(['webp', 'avif', 'jpeg', 'png']),
	maxBytes: 20 * 1024 * 1024,
	maxEdge: 12_000,
	maxArea: 100_000_000,
	maxOutputEdge: { avif: 1200 }
};

/**
 * 浏览器端 wasm-vips。vips 读不了 BMP、ICO，这两种先由浏览器原生解码成像素再交给 vips。
 * HEIC 只有 Safari 能原生解码，不支持，只能由 CF 处理。
 * 面积上限是给浏览器内存留余量的保守值。
 */
export const WASM: EngineCapabilities = {
	input: new Set(['png', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'bmp', 'ico', 'svg']),
	output: new Set(['webp', 'avif', 'jpeg', 'png']),
	maxArea: 200_000_000
};

export const ENGINES: Record<EngineName, EngineCapabilities> = { cf: CF_IMAGES, wasm: WASM };

/**
 * 根据已知信息预判引擎能否处理，能处理返回 null。
 * 宽高未知时不拦截，交给运行时报错后再降级。
 */
export function checkSupport(
	engine: EngineCapabilities,
	info: ImageInfo,
	spec: TransformSpec
): ImagingErrorCode | null {
	if (!engine.input.has(info.format)) return 'UNSUPPORTED_INPUT';
	if (!engine.output.has(spec.format)) return 'UNSUPPORTED_OUTPUT';
	if (engine.maxBytes !== undefined && info.size > engine.maxBytes) return 'TOO_LARGE';

	const { width, height } = info;
	if (width && height) {
		if (engine.maxEdge !== undefined && Math.max(width, height) > engine.maxEdge)
			return 'DIMENSIONS_EXCEEDED';
		if (engine.maxArea !== undefined && width * height > engine.maxArea)
			return 'DIMENSIONS_EXCEEDED';
	}

	const outputLimit = engine.maxOutputEdge?.[spec.format];
	const target = targetSize(info, spec);
	if (outputLimit !== undefined && target && Math.max(target.width, target.height) > outputLimit)
		return 'DIMENSIONS_EXCEEDED';

	return null;
}
