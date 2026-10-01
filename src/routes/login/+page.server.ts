import { fail, redirect } from '@sveltejs/kit';
import { checkCredentials, createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** 只允许跳回本站路径，防止被利用成开放重定向 */
function safeNext(url: URL): string {
	const next = url.searchParams.get('next');
	return next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.loggedIn) redirect(303, safeNext(url));
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals }) => {
		const credentials = locals.config.admin;

		const form = await request.formData();
		const user = String(form.get('user') ?? '');
		const password = String(form.get('password') ?? '');
		if (!(await checkCredentials(credentials, user, password))) {
			return fail(401, { user, invalid: true });
		}

		cookies.set(SESSION_COOKIE, await createSession(credentials), {
			path: '/',
			maxAge: SESSION_TTL_SECONDS
		});
		redirect(303, safeNext(url));
	}
};
