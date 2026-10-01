import {
	MAX_IMAGE_BYTES,
	MAX_VIDEO_BYTES,
	type ClientConfig,
	type ClientProcessingRequired,
	type UploadedImage,
	type UploadMode
} from '$lib/api';
import { MIME_TYPES, probe, PROBE_BYTES } from '$lib/imaging/formats';
import { plan, type TransformSpec } from '$lib/imaging/planner';
import { isWasmAvailable, transformWithWasm } from '$lib/imaging/wasm';
import { sniffVideo } from '$lib/video';
import { ApiRequestError, requestJson } from './http';

export type UploadStage = 'uploading' | 'processing';

/**
 * 浏览器上传流程：本地先用 planner 预判，能确定 CF 处理不了的直接用 WASM，
 * 否则先交给服务端用 CF 处理，失败（422）再用 WASM 处理后重新上传。
 * WASM 也失败时原样上传。视频不做处理，直接上传。
 * 失败时抛出 ApiRequestError，本地检查不通过时同样使用它，便于统一显示错误。
 */
export async function uploadImage(
	file: File,
	config: ClientConfig,
	onStage?: (stage: UploadStage) => void
): Promise<UploadedImage> {
	const head = new Uint8Array(await file.slice(0, PROBE_BYTES).arrayBuffer());
	const info = probe(head, file.size);

	const send = (body: File, mode: UploadMode) => {
		onStage?.('uploading');
		const form = new FormData();
		form.set('file', body);
		form.set('mode', mode);
		return requestJson<UploadedImage>('/api/images', { method: 'POST', body: form });
	};

	if (!info) {
		if (!sniffVideo(head)) throw new ApiRequestError(415, 'UNSUPPORTED_FORMAT', '不支持的文件格式');
		if (!config.allowVideo) throw new ApiRequestError(403, 'VIDEO_DISABLED', '未开启视频上传');
		if (file.size > MAX_VIDEO_BYTES) throw tooLarge(MAX_VIDEO_BYTES);
		return send(file, 'raw');
	}
	if (file.size > MAX_IMAGE_BYTES) throw tooLarge(MAX_IMAGE_BYTES);

	const processLocally = async (spec: TransformSpec) => {
		onStage?.('processing');
		let output: Uint8Array;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			output = await transformWithWasm(bytes, info.format, spec);
		} catch (error) {
			console.warn('WASM 处理失败，原样上传', error);
			return send(file, 'raw');
		}
		// 文件名保留原始名称，服务端记为 originalName
		return send(new File([output as BlobPart], file.name, { type: MIME_TYPES[spec.format] }), 'processed');
	};

	const p = plan(info, config.imaging, { cf: config.cfImage, wasm: isWasmAvailable() });
	if (!p) return send(file, 'raw');
	if (p.engines[0] === 'wasm') return processLocally(p.spec);

	// CF 优先：能退回 WASM 时用 fallback 模式，服务端处理不了会返回 422 和 spec；否则用 auto，服务端失败就原样保存
	if (!p.engines.includes('wasm')) return send(file, 'auto');
	try {
		return await send(file, 'fallback');
	} catch (error) {
		if (!(error instanceof ApiRequestError && error.status === 422)) throw error;
		return processLocally((error.body as unknown as ClientProcessingRequired).spec);
	}
}

function tooLarge(limit: number) {
	return new ApiRequestError(413, 'TOO_LARGE', `文件超过 ${limit / 1024 / 1024}MB`);
}
