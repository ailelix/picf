import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, type Engine, type Uploader, type UploadMode } from '$lib/api';
import { transformWithCf } from '$lib/imaging/cf';
import { EXTENSIONS, MIME_TYPES, probe, PROBE_BYTES, type ImageInfo } from '$lib/imaging/formats';
import { plan, type TransformSpec } from '$lib/imaging/planner';
import { sniffVideo, VIDEO_MIME_TYPES, type VideoFormat } from '$lib/video';
import type { AppConfig } from './env';
import { saveImage } from './images';

type SavedMedia =
	| { kind: 'image'; format: ImageInfo['format']; size: number; width?: number; height?: number }
	| { kind: 'video'; format: VideoFormat; size: number };

type UploadResult =
	| { kind: 'saved'; key: string; media: SavedMedia; engine: Engine }
	/** 需要浏览器按 spec 处理后以 processed 模式重新上传 */
	| { kind: 'fallback'; spec: TransformSpec }
	| { kind: 'rejected'; status: 403 | 413 | 415; error: string; message: string };

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
	{ config, uploader }: { config: AppConfig; uploader: Uploader }
): Promise<UploadResult> {
	const head = new Uint8Array(await file.slice(0, PROBE_BYTES).arrayBuffer());
	const info = probe(head, file.size);
	const store = async (body: Blob | Uint8Array, media: SavedMedia, engine: Engine): Promise<UploadResult> => {
		const key = await saveImage(env, {
			body,
			extension: media.kind === 'image' ? EXTENSIONS[media.format] : media.format,
			contentType: media.kind === 'image' ? MIME_TYPES[media.format] : VIDEO_MIME_TYPES[media.format],
			originalName: file.name,
			engine,
			uploader,
			timeZone: config.timeZone
		});
		return { kind: 'saved', key, media, engine };
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

	const p = plan(info, config.imaging, { cf: config.cfImage, wasm: mode === 'fallback' });
	if (!p) return store(file, image(info), 'none');

	if (p.engines[0] === 'cf') {
		const output = await transformWithCf(env.IMAGES, file, p.spec).catch((error) => {
			console.warn('CF Images 处理失败，尝试降级', error);
			return null;
		});
		if (output) return store(output, image(probe(output) ?? { format: p.spec.format, size: output.length }), 'cf');
	}
	// CF 处理不了或失败了：能用 WASM 时交给浏览器，否则原样保存
	if (p.engines.includes('wasm')) return { kind: 'fallback', spec: p.spec };
	return store(file, image(info), 'none');
}
