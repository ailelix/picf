import type { ImageFormat, ImageInfo, OutputFormat } from './formats';

export interface ImagingSettings {
	/** 需要转换的输入格式；其他格式原样保存 */
	convert: ImageFormat[];
	/** 统一的目标格式 */
	convertTo: OutputFormat;
	/** 1-100 */
	quality: number;
	/** 转换时的最长边上限，只缩小不放大；null 表示不限制 */
	maxEdge: number | null;
}

export const DEFAULT_IMAGING_SETTINGS: ImagingSettings = {
	convert: ['jpeg', 'png', 'bmp', 'tiff', 'heic'],
	convertTo: 'webp',
	quality: 80,
	maxEdge: null
};

/**
 * 一次变换的参数，CF 和 WASM 两边按相同语义实现，保证产出一致：
 * - 缩放只缩小不放大，等同于 CF Images 的 fit=scale-down
 * - 输入是动图且输出格式支持动画时保留动画，否则只取第一帧
 * - 总是去除 EXIF（含 GPS 位置）、ICC 等元数据
 */
export type TransformSpec = Pick<ImagingSettings, 'quality' | 'maxEdge'> & { format: OutputFormat };

export type EngineName = 'cf' | 'wasm';

interface EngineLimits {
	input: ImageFormat[];
	maxBytes?: number;
	/** 输入的最长边 */
	maxEdge?: number;
	/** 输入的面积（像素数） */
	maxArea?: number;
	/** 各输出格式的最长边上限 */
	maxOutputEdge?: Partial<Record<OutputFormat, number>>;
}

const LIMITS: Record<EngineName, EngineLimits> = {
	/**
	 * https://developers.cloudflare.com/images/get-started/limits/
	 * - AVIF 输入仅 Enterprise 可用；SVG 只做清理、不做变换，所以都不算在输入里
	 * - AVIF 输出超过 1200px 时 CF 会静默改用 WebP/JPEG，视为不支持
	 */
	cf: {
		input: ['png', 'jpeg', 'gif', 'webp', 'heic'],
		maxBytes: 20 * 1024 * 1024,
		maxEdge: 12_000,
		maxArea: 100_000_000,
		maxOutputEdge: { avif: 1200 }
	},
	/**
	 * 浏览器端 wasm-vips。BMP、ICO 由浏览器原生解码后再交给 vips；HEIC 只有 Safari 能原生解码，
	 * 所以不支持，只能由 CF 处理。面积上限是给浏览器内存留余量的保守值。
	 */
	wasm: {
		input: ['png', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'bmp', 'ico', 'svg'],
		maxArea: 200_000_000
	}
};

/** 根据已知信息预判引擎能否处理。宽高未知时不拦截，交给运行时报错后再降级 */
function supports(limits: EngineLimits, info: ImageInfo, spec: TransformSpec): boolean {
	if (!limits.input.includes(info.format)) return false;
	if (limits.maxBytes && info.size > limits.maxBytes) return false;

	const { width, height } = info;
	if (!width || !height) return true;
	const edge = Math.max(width, height);
	if (limits.maxEdge && edge > limits.maxEdge) return false;
	if (limits.maxArea && width * height > limits.maxArea) return false;

	const outputLimit = limits.maxOutputEdge?.[spec.format];
	return !outputLimit || Math.min(edge, spec.maxEdge ?? edge) <= outputLimit;
}

export interface Plan {
	spec: TransformSpec;
	/** 按顺序尝试（CF 优先），前一个运行时失败就换下一个 */
	engines: EngineName[];
}

/** 决定图片怎么处理；返回 null 表示原样保存：该格式不需要转换，或没有可用的引擎能处理 */
export function plan(info: ImageInfo, settings: ImagingSettings, available: Record<EngineName, boolean>): Plan | null {
	if (!settings.convert.includes(info.format)) return null;

	const spec: TransformSpec = { format: settings.convertTo, quality: settings.quality, maxEdge: settings.maxEdge };
	const engines = (['cf', 'wasm'] as const).filter((engine) => available[engine] && supports(LIMITS[engine], info, spec));
	return engines.length > 0 ? { spec, engines } : null;
}
