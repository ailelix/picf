import { json, type Handle, type RequestEvent } from '@sveltejs/kit';
import type { Credentials } from '$lib/server/auth';
import { isLocale, LOCALE_COOKIE, negotiateLocale, translate, type Locale } from '$lib/i18n/locale';
import { htmlLang, isTheme, THEME_COOKIE } from '$lib/prefs';
import { checkCredentials, parseBasicAuth, SESSION_COOKIE, verifySession } from '$lib/server/auth';
import { loadConfig, requireEnv, type ConfigIssue } from '$lib/server/env';

/** 不需要登录的页面 */
const PUBLIC_PATHS = new Set(['/login']);
/** 开启匿名上传后，未登录也能访问的上传页和上传接口 */
const ANONYMOUS_UPLOAD_ROUTES = new Set(['GET /', 'POST /api/images']);

/** wasm-vips 需要 SharedArrayBuffer，页面必须跨域隔离；静态资源的同名响应头在项目根目录的 _headers */
const ISOLATION_HEADERS = {
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-embedder-policy': 'require-corp'
};
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const handle: Handle = async ({ event, resolve }) => {
	const { url, request } = event;
	// 本地开发用的文件路由（线上返回 404），不需要认证
	if (url.pathname.startsWith('/i/')) return resolve(event);

	const locale = event.cookies.get(LOCALE_COOKIE);
	event.locals.locale = isLocale(locale) ? locale : negotiateLocale(request.headers.get('accept-language'));
	const theme = event.cookies.get(THEME_COOKIE);
	event.locals.theme = isTheme(theme) ? theme : 'auto';

	// 环境变量缺少或无效时，所有页面和接口都只显示配置提示（例如避免上传成功却生成无法访问的链接）
	const loaded = loadConfig(requireEnv(event.platform));
	if (!loaded.ok) return setupRequired(event.locals.locale, loaded.issues, url.pathname.startsWith('/api/'));
	const { config } = loaded;
	event.locals.config = config;

	const basic = parseBasicAuth(request.headers.get('authorization'));
	event.locals.auth = await authenticate(event, config.admin, basic);

	// 带了 Basic Auth 但凭证错误时直接拒绝，不当作匿名请求，免得 API 客户端配错密码却以匿名身份上传成功
	if (basic && !event.locals.auth) return unauthorized();

	// SvelteKit 自带的 CSRF 检查已关闭（它会拦截没有 Origin 头的 API 上传），在这里自己做：
	// 只有靠 cookie 认证的写操作需要检查同源。Basic Auth 不会被浏览器自动携带（我们从不返回
	// WWW-Authenticate）；未登录的请求本来就没有可以被冒用的权限。
	if (
		event.locals.auth === 'session' &&
		!SAFE_METHODS.has(request.method) &&
		request.headers.get('origin') !== url.origin
	) {
		return json({ error: 'CSRF', message: '跨站请求被拒绝' }, { status: 403 });
	}

	if (!event.locals.auth && !PUBLIC_PATHS.has(url.pathname) && !allowsAnonymous(event)) {
		if (url.pathname.startsWith('/api/')) return unauthorized();
		const next = encodeURIComponent(url.pathname + url.search);
		return new Response(null, { status: 303, headers: { location: `/login?next=${next}` } });
	}

	const { locale: lang, theme: mode } = event.locals;
	const response = await resolve(event, {
		// 服务端渲染时就输出用户选择的语言和主题，避免页面加载后再切换造成闪烁
		transformPageChunk: ({ html }) =>
			html
				.replace('%picf.lang%', htmlLang(lang))
				.replace('%picf.theme%', mode === 'auto' ? '' : ` data-theme="${mode}"`)
	});
	for (const [name, value] of Object.entries(ISOLATION_HEADERS)) response.headers.set(name, value);
	return response;
};

/** 配置提示页；内容都来自固定文案和变量名，不含用户输入，无需转义 */
function setupRequired(locale: Locale, issues: ConfigIssue[], api: boolean) {
	const title = translate(locale, 'setup.title');
	const intro = translate(locale, 'setup.intro');
	const describe = ({ problem, expected }: ConfigIssue) => translate(locale, `setup.${problem}`, { expected });
	if (api) {
		const details = issues.map((issue) => `${issue.name}: ${describe(issue)}`).join('; ');
		return json({ error: 'NOT_CONFIGURED', message: `${intro} ${details}`, issues }, { status: 503 });
	}

	const items = issues.map((issue) => `<li><code>${issue.name}</code> — ${describe(issue)}</li>`).join('');
	const html = `<!doctype html><html lang="${htmlLang(locale)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${title}</title></head>
<body style="max-width:640px;margin:15vh auto;padding:0 24px;font:15px/1.7 system-ui,sans-serif">
<h1 style="font-size:1.4rem">${title}</h1><p>${intro}</p><ul>${items}</ul></body></html>`;
	return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function unauthorized() {
	return json({ error: 'UNAUTHORIZED', message: '未登录或凭证错误' }, { status: 401 });
}

function allowsAnonymous({ request, url, locals }: RequestEvent): boolean {
	return locals.config.allowAnonymous && ANONYMOUS_UPLOAD_ROUTES.has(`${request.method} ${url.pathname}`);
}

async function authenticate(
	event: RequestEvent,
	credentials: Credentials,
	basic: ReturnType<typeof parseBasicAuth>
): Promise<App.Locals['auth']> {
	if (basic) {
		return (await checkCredentials(credentials, basic.user, basic.password)) ? 'basic' : null;
	}
	return (await verifySession(credentials, event.cookies.get(SESSION_COOKIE))) ? 'session' : null;
}
