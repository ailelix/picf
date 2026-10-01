<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.png';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { Preferences, setPrefs } from '$lib/prefs.svelte';
	import { setToaster, Toaster } from '$lib/toast.svelte';
	import { untrack } from 'svelte';

	let { data, children } = $props();

	// 只用服务端给的初始值，之后由切换按钮更新
	const prefs = setPrefs(untrack(() => new Preferences(data.locale, data.theme)));
	setToaster(new Toaster());
	const { t } = prefs;

	const NAV: { href: string; label: MessageKey; icon: IconName }[] = [
		{ href: '/', label: 'nav.upload', icon: 'upload' },
		{ href: '/images', label: 'nav.images', icon: 'images' }
	];
	const THEME_ICON = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' } as const;
</script>

<svelte:head>
	<!-- static/favicon.ico 含 16/32/48 三种尺寸；高分辨率场景和苹果设备主屏幕用原图 -->
	<link rel="icon" href="/favicon.ico" sizes="48x48" />
	<link rel="icon" href={logo} type="image/png" sizes="256x256" />
	<link rel="apple-touch-icon" href={logo} />
	<title>{t('app.name')}</title>
</svelte:head>

<header>
	<a class="brand" href="/" aria-label={t('app.name')}>
		<img src={logo} alt="" width="36" height="36" />
	</a>

	{#if data.loggedIn}
		<nav>
			{#each NAV as item (item.href)}
				<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>
					<Icon name={item.icon} />
					<span>{t(item.label)}</span>
				</a>
			{/each}
		</nav>
	{/if}

	<div class="actions">
		<button class="icon-btn" title={t('locale.switch')} aria-label={t('locale.switch')} onclick={() => prefs.toggleLocale()}>
			<Icon name="translate" />
		</button>
		<button
			class="icon-btn"
			title={t(`theme.${prefs.theme}`)}
			aria-label={t(`theme.${prefs.theme}`)}
			onclick={() => prefs.cycleTheme()}
		>
			<Icon name={THEME_ICON[prefs.theme]} />
		</button>
		{#if data.loggedIn}
			<form method="POST" action="/logout">
				<button class="icon-btn" title={t('nav.logout')} aria-label={t('nav.logout')}>
					<Icon name="logout" />
				</button>
			</form>
		{:else if page.url.pathname !== '/login'}
			<a class="btn tonal small" href="/login?next={encodeURIComponent(page.url.pathname)}">
				<Icon name="login" size={18} />
				{t('nav.login')}
			</a>
		{/if}
	</div>
</header>

<main>
	{@render children()}
</main>

<Toasts />

<style>
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 1200px;
		margin: 0 auto;
		padding: 12px 16px;
	}
	.brand {
		display: flex;
		margin-right: 12px;
		border-radius: var(--radius-s);
	}
	.brand img {
		display: block;
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 40px;
		padding: 0 16px;
		border-radius: var(--radius-full);
		color: var(--text-2);
		font-weight: 500;
		transition:
			background-color 0.15s,
			color 0.15s;
	}
	nav a:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	nav a[aria-current='page'] {
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}
	form {
		display: contents;
	}
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 8px 16px 48px;
	}

	/* 窄屏：导航只显示图标 */
	@media (max-width: 640px) {
		.brand {
			margin-right: 4px;
		}
		nav a {
			padding: 0 10px;
		}
		nav a span {
			display: none;
		}
	}
</style>
