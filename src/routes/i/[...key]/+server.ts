import { dev } from '$app/environment';
import { requireEnv } from '$lib/server/env';
import type { RequestHandler } from './$types';

/**
 * 仅用于本地开发：本地的 R2 是模拟的，没有公共域名，由这里读出文件返回。
 * 线上文件由 R2 公共域名（R2_PUBLIC_URL）直接提供，这个路由返回 404。
 */
export const GET: RequestHandler = async ({ platform, params }) => {
	const object = dev ? await requireEnv(platform).BUCKET.get(params.key) : null;
	if (!object) return new Response('Not Found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	return new Response(object.body, { headers });
};
