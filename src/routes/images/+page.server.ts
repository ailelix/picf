import { mediaBase, requireEnv } from '$lib/server/env';
import { listImages } from '$lib/server/images';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ platform, url, locals }) =>
	listImages(requireEnv(platform).DB, mediaBase(locals.config, url.origin), null);
