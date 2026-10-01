import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	loggedIn: locals.loggedIn,
	locale: locals.locale,
	theme: locals.theme
});
