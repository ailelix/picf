import { json } from '@sveltejs/kit';
import {
	MAX_VIDEO_BYTES,
	UPLOAD_MODES,
	type ApiError,
	type ClientProcessingRequired,
	type UploadedImage,
	type UploadMode
} from '$lib/api';
import { mediaBase, requireEnv } from '$lib/server/env';
import { listImages } from '$lib/server/images';
import { handleUpload } from '$lib/server/upload';
import type { RequestHandler } from './$types';

/** GET /api/images?cursor=... 图片管理页的「加载更多」，按时间倒序列出图片 */
export const GET: RequestHandler = async ({ platform, url, locals }) => {
	const base = mediaBase(locals.config, url.origin);
	return json(await listImages(requireEnv(platform).DB, base, url.searchParams.get('cursor')));
};

/**
 * POST /api/images，供上传页使用，multipart/form-data：
 * - file：图片或视频
 * - mode：auto | fallback | processed | raw，含义见 $lib/api
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

	const mode = form.get('mode');
	if (!UPLOAD_MODES.includes(mode as UploadMode)) {
		return json({ error: 'BAD_REQUEST', message: `mode 只能是 ${UPLOAD_MODES.join(' / ')}` } satisfies ApiError, {
			status: 400
		});
	}

	const result = await handleUpload(env, file, mode as UploadMode, {
		config: locals.config,
		uploader: locals.loggedIn ? 'admin' : 'anonymous'
	});

	switch (result.kind) {
		case 'saved': {
			const { key, media, engine } = result;
			const link = `${mediaBase(locals.config, url.origin)}/${key}`;
			return json({ url: link, ...media, engine } satisfies UploadedImage, { status: 201 });
		}
		case 'fallback':
			return json(
				{ error: 'CLIENT_PROCESSING_REQUIRED', spec: result.spec } satisfies ClientProcessingRequired,
				{ status: 422 }
			);
		case 'rejected':
			return json(
				{ error: result.error, message: result.message } satisfies ApiError,
				{ status: result.status }
			);
	}
};
