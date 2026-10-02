<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { ImageList, ListedImage } from '$lib/api';
	import { ApiRequestError, requestJson } from '$lib/client/http';
	import Icon from '$lib/components/Icon.svelte';
	import { errorMessage } from '$lib/i18n/errors';
	import { copyText, mediaKind } from '$lib/links';
	import { getPrefs } from '$lib/prefs.svelte';
	import { getToaster } from '$lib/toast.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();
	const prefs = getPrefs();
	const { t } = prefs;
	const toaster = getToaster();

	// 首页由服务端加载，之后"加载更多"和删除都在本地更新
	let items = $state<ListedImage[]>(untrack(() => data.items));
	let cursor = $state(untrack(() => data.cursor));
	let loading = $state(false);
	/** 浏览器显示不了的文件（TIFF、HEIC 等）改显示图标 */
	const broken = new SvelteSet<string>();
	/** 点过一次删除、等待确认的项 */
	let confirming = $state<string | null>(null);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;

	/** 卡片较窄，只显示日期，完整时间放在悬停提示里 */
	const dateFormat = $derived(new Intl.DateTimeFormat(prefs.locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium' }));
	const timeFormat = $derived(
		new Intl.DateTimeFormat(prefs.locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'full', timeStyle: 'medium' })
	);

	async function loadMore() {
		if (!cursor || loading) return;
		loading = true;
		try {
			const page = await requestJson<ImageList>(`/api/images?cursor=${encodeURIComponent(cursor)}`);
			items.push(...page.items);
			cursor = page.cursor;
		} catch (error) {
			toaster.show(errorMessage(t, error), 'error');
		} finally {
			loading = false;
		}
	}

	async function copy(item: ListedImage) {
		const ok = await copyText(item.url);
		toaster.show(t(ok ? 'copy.done' : 'copy.failed'), ok ? 'info' : 'error');
	}

	/** 第一次点击进入确认状态，3 秒内再点一次才真正删除 */
	async function remove(item: ListedImage) {
		clearTimeout(confirmTimer);
		if (confirming !== item.id) {
			confirming = item.id;
			confirmTimer = setTimeout(() => (confirming = null), 3000);
			return;
		}
		confirming = null;
		try {
			await requestJson(`/api/images/${item.id}`, { method: 'DELETE' });
		} catch (error) {
			// 404 说明已经被删掉了，同样从列表移除
			if (!(error instanceof ApiRequestError && error.status === 404)) {
				toaster.show(errorMessage(t, error), 'error');
				return;
			}
		}
		items = items.filter((i) => i.id !== item.id);
		toaster.show(t('images.deleted'));
	}

	function extension(key: string) {
		return key.split('.').pop()?.toUpperCase() ?? '';
	}
</script>

<div class="heading">
	<h1>{t('images.title')}</h1>
</div>

{#if items.length === 0}
	<div class="empty card">
		<Icon name="images" size={40} />
		<p class="muted">{t('images.empty')}</p>
		<a class="btn tonal" href="/"><Icon name="upload" size={18} />{t('nav.upload')}</a>
	</div>
{:else}
	<ul class="grid">
		{#each items as item (item.id)}
			{@const kind = mediaKind(item.key)}
			<li class="tile">
				<a class="preview" href={item.url} target="_blank" rel="noreferrer" title={t('images.open')}>
					{#if kind === 'video'}
						<video src={item.url} preload="metadata" muted crossorigin="anonymous"></video>
						<span class="badge"><Icon name="movie" size={16} /></span>
					{:else if broken.has(item.id)}
						<span class="fallback"><Icon name="file" size={32} />{extension(item.key)}</span>
					{:else}
						<!-- 图片可能在 R2 公共域名上（跨域），页面开启了 COEP，需要 crossorigin 配合 R2 的 CORS -->
						<img
							src={item.url}
							alt=""
							loading="lazy"
							decoding="async"
							crossorigin="anonymous"
							onerror={() => broken.add(item.id)}
						/>
					{/if}
				</a>
				<div class="bar">
					<div class="meta">
						<span class="chip">{extension(item.key)}</span>
						<time
							class="muted"
							datetime={new Date(item.createdAt * 1000).toISOString()}
							title={timeFormat.format(item.createdAt * 1000)}
						>
							{dateFormat.format(item.createdAt * 1000)}
						</time>
					</div>
					<div class="buttons">
						<button class="icon-btn small" title={t('images.copy')} aria-label={t('images.copy')} onclick={() => copy(item)}>
							<Icon name="copy" size={18} />
						</button>
						{#if confirming === item.id}
							<button class="btn danger small" onclick={() => remove(item)}>{t('images.confirmDelete')}</button>
						{:else}
							<button
								class="icon-btn small"
								title={t('images.delete')}
								aria-label={t('images.delete')}
								onclick={() => remove(item)}
							>
								<Icon name="delete" size={18} />
							</button>
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>

	{#if cursor}
		<div class="more">
			<button class="btn tonal" onclick={loadMore} disabled={loading}>{t('images.loadMore')}</button>
		</div>
	{/if}
{/if}

<style>
	.heading {
		margin: 8px 0 20px;
	}
	.empty {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 56px 24px;
		color: var(--text-2);
	}
	.empty p {
		margin: 0 0 8px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tile {
		overflow: hidden;
		border-radius: var(--radius-l);
		background: var(--surface);
	}
	/* 所有卡片的预览区都是正方形，图片裁剪填满；图片脱离文档流，否则竖图会把 aspect-ratio 撑高 */
	.preview {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--surface-2);
		color: var(--text-2);
	}
	.preview img,
	.preview video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.fallback {
		display: grid;
		justify-items: center;
		gap: 4px;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.badge {
		position: absolute;
		top: 8px;
		left: 8px;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		height: 56px;
		padding: 0 8px 0 12px;
	}
	.meta {
		display: grid;
		gap: 2px;
		min-width: 0;
		font-size: 0.75rem;
	}
	.meta .chip {
		justify-self: start;
		height: 20px;
		font-size: 0.6875rem;
	}
	.meta time {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.buttons {
		display: flex;
		align-items: center;
		flex: none;
	}

	.more {
		display: flex;
		justify-content: center;
		margin-top: 24px;
	}

	@media (max-width: 480px) {
		.grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}
	}
</style>
