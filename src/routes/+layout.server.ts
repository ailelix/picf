import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	loggedIn: locals.auth !== null,
	locale: locals.locale,
	theme: locals.theme
});
