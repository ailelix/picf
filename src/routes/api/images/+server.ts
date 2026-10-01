import { json } from '@sveltejs/kit';
import {
	MAX_VIDEO_BYTES,
	UPLOAD_MODES,
	IMAGE_PAGE_SIZE,
	type ApiError,
	type ClientProcessingRequired,
	type ImageList,
	type UploadedImage,
	type UploadMode
} from '$lib/api';
import { mediaBase, requireEnv } from '$lib/server/env';
import { listImages, publicUrl } from '$lib/server/images';
import { handleUpload } from '$lib/server/upload';
import type { RequestHandler } from './$types';

/** GET /api/images?limit=30&cursor=... 按时间倒序列出图片 */
export const GET: RequestHandler = async ({ platform, url, locals }) => {
	const env = requireEnv(platform);
	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || IMAGE_PAGE_SIZE));
	const page = await listImages(env.DB, { limit, cursor: url.searchParams.get('cursor') });
	const base = mediaBase(locals.config, url.origin);
	return json({
		items: page.items.map((r) => ({ ...r, url: publicUrl(base, r.key) })),
		cursor: page.cursor
	} satisfies ImageList);
};

/**
 * POST /api/images，multipart/form-data：
 * - file：图片或视频（必填）
 * - mode：auto（默认）| fallback | processed | raw，含义见 $lib/api
 * 开启匿名上传时未登录也能调用（见 hooks.server.ts）。
 */
export const POST: RequestHandler = async ({ platform, request, url, locals }) => {
	const env = requireEnv(platform);
	// 在解析请求体之前就拦下明显过大的请求；图片和视频的具体上限在 handleUpload 里按类型判断
	if (Number(request.headers.get('content-length')) > MAX_VIDEO_BYTES + 64 * 1024) {
		return json({ error: 'TOO_LARGE', message: '文件过大' }, { status: 413 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'BAD_REQUEST', message: '请使用 multipart/form-data 上传' }, { status: 400 });
	}
	const file = form.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'BAD_REQUEST', message: '缺少 file 字段' }, { status: 400 });
	}

	const mode = form.get('mode') ?? 'auto';
	if (!UPLOAD_MODES.includes(mode as UploadMode)) {
		return json({ error: 'BAD_REQUEST', message: `mode 只能是 ${UPLOAD_MODES.join(' / ')}` } satisfies ApiError, {
			status: 400
		});
	}

	const result = await handleUpload(env, file, mode as UploadMode, {
		config: locals.config,
		uploader: locals.auth ? 'admin' : 'anonymous'
	});

	switch (result.kind) {
		case 'saved': {
			const { record, media, engine } = result;
			return json(
				{
					id: record.id,
					key: record.key,
					url: publicUrl(mediaBase(locals.config, url.origin), record.key),
					createdAt: record.createdAt,
					...media,
					engine
				} satisfies UploadedImage,
				{ status: 201 }
			);
		}
		case 'fallback':
			return json(
				{
					error: 'CLIENT_PROCESSING_REQUIRED',
					spec: result.spec,
					reasons: result.reasons
				} satisfies ClientProcessingRequired,
				{ status: 422 }
			);
		case 'rejected':
			return json(
				{ error: result.error, message: result.message } satisfies ApiError,
				{ status: result.status }
			);
	}
};
