// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/**
	 * Worker 的绑定和环境变量。绑定与 wrangler.jsonc 保持一致；环境变量在 Cloudflare 控制台设置，
	 * 由 src/lib/server/env.ts 统一解析和校验，含义见 README。类型手动维护，不由 wrangler 生成：
	 * 生成的类型会包含本地 .env 里恰好存在的变量，在不同机器和 CI 上不一致。
	 */
	interface Env {
		ASSETS: Fetcher;
		BUCKET: R2Bucket;
		DB: D1Database;
		IMAGES: ImagesBinding;
		ADMIN_USER?: string;
		ADMIN_PASSWORD?: string;
		R2_PUBLIC_URL?: string;
		CF_IMAGE?: string;
		CONVERT_FORMATS?: string;
		CONVERT_TO?: string;
		QUALITY?: string;
		MAX_EDGE?: string;
		ALLOW_ANONYMOUS?: string;
		ALLOW_VIDEO?: string;
		TIMEZONE?: string;
	}

	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties
		}

		// interface Error {}
		interface Locals {
			loggedIn: boolean;
			locale: import('$lib/i18n/locale').Locale;
			theme: import('$lib/prefs.svelte').Theme;
			/** 由环境变量解析出的配置；hooks 在配置有问题时直接返回配置提示，所以路由里一定存在 */
			config: import('$lib/server/env').AppConfig;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
