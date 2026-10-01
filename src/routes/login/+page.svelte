<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import { getPrefs } from '$lib/prefs.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const { t } = getPrefs();
	let submitting = $state(false);
</script>

<div class="wrap">
	<form
		class="card"
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<h1>{t('login.title')}</h1>

		{#if form?.invalid}
			<p class="alert" role="alert">
				<Icon name="error" size={18} />
				{t('login.invalid')}
			</p>
		{/if}

		<label class="field">
			<span>{t('login.user')}</span>
			<input name="user" autocomplete="username" required value={form?.user ?? ''} />
		</label>
		<label class="field">
			<span>{t('login.password')}</span>
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		<button class="btn filled" disabled={submitting}>{t('login.submit')}</button>
	</form>
</div>

<style>
	.wrap {
		display: grid;
		place-items: center;
		min-height: 60vh;
	}
	form {
		display: grid;
		gap: 16px;
		width: min(100%, 380px);
		padding: 32px 28px;
	}
	h1 {
		margin-bottom: 4px;
	}
	.alert {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--danger-container);
		color: var(--on-danger-container);
		font-size: 0.875rem;
	}
	button {
		margin-top: 8px;
	}
</style>
