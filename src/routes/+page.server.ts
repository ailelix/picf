import type { ClientConfig } from '$lib/api';
import type { PageServerLoad } from './$types';

/** 上传页需要的配置。未登录且没开匿名上传时，hooks 已经跳转到登录页 */
export const load: PageServerLoad = ({ locals: { config } }) => ({
	config: {
		cfEnabled: config.cfImage,
		imaging: config.imaging,
		allowVideo: config.allowVideo
	} satisfies ClientConfig
});
