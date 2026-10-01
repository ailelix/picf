import { json } from '@sveltejs/kit';
import { requireEnv } from '$lib/server/env';
import { deleteImage } from '$lib/server/images';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ platform, params }) => {
	const deleted = await deleteImage(requireEnv(platform), params.id);
	return deleted
		? new Response(null, { status: 204 })
		: json({ error: 'NOT_FOUND', message: '图片不存在' }, { status: 404 });
};
