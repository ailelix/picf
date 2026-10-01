<script lang="ts">
	import { getToaster } from '$lib/toast.svelte';
	import Icon from './Icon.svelte';

	const toaster = getToaster();
</script>

<div class="toasts" role="status" aria-live="polite">
	{#each toaster.items as toast (toast.id)}
		<div class="toast" class:error={toast.kind === 'error'}>
			<Icon name={toast.kind === 'error' ? 'error' : 'check'} size={18} />
			{toast.text}
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		bottom: 24px;
		z-index: 10;
		display: grid;
		justify-items: center;
		gap: 8px;
		translate: -50% 0;
		pointer-events: none;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: min(90vw, 480px);
		padding: 10px 18px;
		border-radius: var(--radius-full);
		/* 反色，与页面区分开 */
		background: var(--text);
		color: var(--bg);
		font-size: 0.875rem;
		animation: rise 0.2s ease-out;
	}
	.toast.error {
		background: var(--danger);
		color: var(--surface);
	}
	@keyframes rise {
		from {
			opacity: 0;
			translate: 0 8px;
		}
	}
</style>
