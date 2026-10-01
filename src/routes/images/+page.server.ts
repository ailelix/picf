import { IMAGE_PAGE_SIZE, type ImageList } from '$lib/api';
import { mediaBase, requireEnv } from '$lib/server/env';
import { listImages, publicUrl } from '$lib/server/images';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url, locals }): Promise<ImageList> => {
	const page = await listImages(requireEnv(platform).DB, { limit: IMAGE_PAGE_SIZE });
	const base = mediaBase(locals.config, url.origin);
	return { items: page.items.map((r) => ({ ...r, url: publicUrl(base, r.key) })), cursor: page.cursor };
};
