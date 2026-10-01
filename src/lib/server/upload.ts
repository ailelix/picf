import {
	MAX_IMAGE_BYTES,
	MAX_VIDEO_BYTES,
	type Engine,
	type Uploader,
	type UploadMode
} from '$lib/api';
import {
	EXTENSIONS,
	ImagingError,
	MIME_TYPES,
	plan,
	probe,
	type ImageInfo,
	type Rejection,
	type TransformSpec
} from '$lib/imaging/core';
import { transformWithCf } from '$lib/imaging/server/cf';
import { sniffVideo, VIDEO_MIME_TYPES, type VideoFormat } from '$lib/video';
import type { AppConfig } from './env';
import { saveImage, type ImageRecord } from './images';

/** 识别格式和读宽高只看文件开头；JPEG 的尺寸信息可能排在较大的 EXIF 之后，所以留足余量 */
const PROBE_BYTES = 256 * 1024;

export type SavedMedia =
	| { kind: 'image'; format: ImageInfo['format']; size: number; width?: number; height?: number }
	| { kind: 'video'; format: VideoFormat; size: number };

export type UploadResult =
	| { kind: 'saved'; record: ImageRecord; media: SavedMedia; engine: Engine }
	/** 需要浏览器按 spec 处理后以 processed 模式重新上传 */
	| { kind: 'fallback'; spec: TransformSpec; reasons: Rejection[] }
	| { kind: 'rejected'; status: 403 | 413 | 415; error: string; message: string };

export interface UploadContext {
	config: AppConfig;
	uploader: Uploader;
}

const tooLarge = (limit: number): UploadResult => ({
	kind: 'rejected',
	status: 413,
	error: 'TOO_LARGE',
	message: `文件超过 ${limit / 1024 / 1024}MB`
});

/** 各 mode 的含义见 $lib/api 的 UPLOAD_MODES */
export async function handleUpload(
	env: Env,
	file: File,
	mode: UploadMode,
	{ config, uploader }: UploadContext
): Promise<UploadResult> {
	const head = new Uint8Array(await file.slice(0, PROBE_BYTES).arrayBuffer());
	const info = probe(head, file.size);
	const store = async (body: Blob | Uint8Array, media: SavedMedia, engine: Engine): Promise<UploadResult> => {
		const record = await saveImage(env, {
			body,
			extension: media.kind === 'image' ? EXTENSIONS[media.format] : media.format,
			contentType: media.kind === 'image' ? MIME_TYPES[media.format] : VIDEO_MIME_TYPES[media.format],
			originalName: file.name,
			engine,
			uploader,
			timeZone: config.timeZone
		});
		return { kind: 'saved', record, media, engine };
	};

	if (!info) {
		const video = sniffVideo(head);
		if (!video) return { kind: 'rejected', status: 415, error: 'UNSUPPORTED_FORMAT', message: '不支持的文件格式' };
		if (!config.allowVideo) {
			return { kind: 'rejected', status: 403, error: 'VIDEO_DISABLED', message: '未开启视频上传' };
		}
		if (file.size > MAX_VIDEO_BYTES) return tooLarge(MAX_VIDEO_BYTES);
		return store(file, { kind: 'video', format: video, size: file.size }, 'none');
	}

	if (file.size > MAX_IMAGE_BYTES) return tooLarge(MAX_IMAGE_BYTES);
	const image = (i: ImageInfo): SavedMedia => ({ kind: 'image', ...i });

	if (mode === 'processed') return store(file, image(info), 'wasm');
	if (mode === 'raw') return store(file, image(info), 'none');

	const p = plan(info, config.imaging, { cfEnabled: config.cfImage, wasmAvailable: mode === 'fallback' });
	if (p.kind === 'store') return store(file, image(info), 'none');

	const reasons = [...p.rejected];
	for (const engine of p.engines) {
		if (engine === 'wasm') return { kind: 'fallback', spec: p.spec, reasons };
		try {
			const result = await transformWithCf(env.IMAGES, new Uint8Array(await file.arrayBuffer()), p.spec);
			const output = probe(result.bytes) ?? { format: p.spec.format, size: result.bytes.length };
			return store(result.bytes, image(output), 'cf');
		} catch (error) {
			if (!(error instanceof ImagingError)) throw error;
			console.warn(`CF Images 处理失败，尝试降级：${error.message}`);
			reasons.push({ engine: 'cf', code: error.code });
		}
	}
	// 走到这里说明只有 CF 可用且失败了，原样保存
	return store(file, image(info), 'none');
}
