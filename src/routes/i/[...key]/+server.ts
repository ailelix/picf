import { dev } from '$app/environment';
import { requireEnv } from '$lib/server/env';
import { OBJECT_KEY_PATTERN } from '$lib/server/images';
import type { RequestHandler } from './$types';

/**
 * 仅用于本地开发：本地的 R2 是模拟的，没有公共域名，由这里读出文件返回。
 * 线上文件由 R2 公共域名（R2_PUBLIC_URL）直接提供，这个路由返回 404。
 * 支持 Range 请求，以便在本地拖动视频进度条。
 */
export const GET: RequestHandler = async ({ platform, params, request }) => {
	if (!dev || !OBJECT_KEY_PATTERN.test(params.key)) return new Response('Not Found', { status: 404 });

	const object = await requireEnv(platform).BUCKET.get(params.key, { range: request.headers });
	if (!object) return new Response('Not Found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('accept-ranges', 'bytes');

	if (object.range && request.headers.has('range')) {
		const { offset, length } = resolveRange(object.range, object.size);
		headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
		return new Response(object.body, { status: 206, headers });
	}
	return new Response(object.body, { headers });
};

function resolveRange(range: R2Range, size: number) {
	if ('suffix' in range) {
		const length = Math.min(range.suffix, size);
		return { offset: size - length, length };
	}
	const offset = range.offset ?? 0;
	return { offset, length: range.length ?? size - offset };
}
