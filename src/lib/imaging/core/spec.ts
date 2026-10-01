import type { ImageInfo, OutputFormat } from './formats';

/**
 * 一次变换的参数，CF 和 WASM 两边按相同语义实现，保证产出一致：
 * - 缩放只缩小不放大，等同于 CF Images 的 fit=scale-down
 * - 输入是动图且输出格式支持动画时保留动画，否则只取第一帧
 * - 总是去除 EXIF（含 GPS 位置）、ICC 等元数据
 */
export interface TransformSpec {
	format: OutputFormat;
	/** 1-100 */
	quality: number;
	width?: number;
	height?: number;
}

/** 按 spec 计算输出尺寸；源图尺寸未知时返回 null */
export function targetSize(
	info: Pick<ImageInfo, 'width' | 'height'>,
	spec: Pick<TransformSpec, 'width' | 'height'>
): { width: number; height: number } | null {
	const { width, height } = info;
	if (!width || !height) return null;

	const scales = [spec.width && spec.width / width, spec.height && spec.height / height].filter(
		(s): s is number => !!s
	);
	const scale = Math.min(1, ...scales);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}
