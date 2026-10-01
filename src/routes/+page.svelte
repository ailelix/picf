<script lang="ts">
	import { onMount } from 'svelte';
	import type { UploadedImage } from '$lib/api';
	import { uploadImage, type UploadStage } from '$lib/client/upload';
	import Icon from '$lib/components/Icon.svelte';
	import { errorMessage } from '$lib/i18n/errors';
	import { isWasmAvailable, transformWithWasm } from '$lib/imaging/client/wasm';
	import { copyText, formatLink, LINK_FORMATS, type LinkFormat } from '$lib/links';
	import { getPrefs } from '$lib/prefs.svelte';
	import { getToaster } from '$lib/toast.svelte';
	import { VIDEO_MIME_TYPES } from '$lib/video';

	let { data } = $props();
	const { t } = getPrefs();
	const toaster = getToaster();

	interface Item {
		id: number;
		file: File;
		/** 本地预览；浏览器显示不了的格式（TIFF、HEIC 等）加载失败后改显示图标 */
		preview: string | null;
		previewFailed: boolean;
		status: 'waiting' | UploadStage | 'done' | 'error';
		result?: UploadedImage;
		error?: string;
	}

	let items = $state<Item[]>([]);
	let dragging = $state(false);
	let nextId = 0;
	let running = false;

	onMount(() => () => items.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)));

	const accept = $derived(
		['image/*', '.heic', '.heif', ...(data.config.allowVideo ? [...Object.values(VIDEO_MIME_TYPES), '.mov'] : [])].join(',')
	);

	function add(files: Iterable<File>) {
		for (const file of files) {
			const isImage = file.type.startsWith('image/');
			items.push({
				id: nextId++,
				file,
				preview: isImage ? URL.createObjectURL(file) : null,
				previewFailed: false,
				status: 'waiting'
			});
		}
		void run();
	}

	/** 依次上传队列里等待中的文件 */
	async function run() {
		if (running) return;
		running = true;
		try {
			const wasmAvailable = isWasmAvailable();
			let item: Item | undefined;
			while ((item = items.find((i) => i.status === 'waiting'))) {
				const current = item;
				try {
					current.result = await uploadImage(current.file, data.config, {
						wasmAvailable,
						transform: transformWithWasm,
						onStage: (stage) => (current.status = stage)
					});
					current.status = 'done';
				} catch (error) {
					current.error = errorMessage(t, error);
					current.status = 'error';
				}
			}
		} finally {
			running = false;
		}
	}

	function clearFinished() {
		for (const item of items) if (item.status === 'done' && item.preview) URL.revokeObjectURL(item.preview);
		items = items.filter((i) => i.status !== 'done');
	}

	async function copy(item: Item, format: LinkFormat) {
		const result = item.result!;
		const ok = await copyText(formatLink(format, result.url, result.kind, item.file.name));
		toaster.show(t(ok ? 'copy.done' : 'copy.failed'), ok ? 'info' : 'error');
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (event.dataTransfer?.files.length) add(event.dataTransfer.files);
	}

	function onPaste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])];
		if (files.length === 0) return;
		event.preventDefault();
		add(files);
	}

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<svelte:window onpaste={onPaste} />

<h1 class="visually-hidden">{t('upload.title')}</h1>

<label
	class="dropzone"
	class:dragging
	ondragover={(e) => (e.preventDefault(), (dragging = true))}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<input
		class="visually-hidden"
		type="file"
		multiple
		{accept}
		onchange={(e) => (add(e.currentTarget.files ?? []), (e.currentTarget.value = ''))}
	/>
	<span class="icon"><Icon name="cloudUpload" size={40} /></span>
	<strong>{t('upload.drop')}</strong>
	<span class="muted">{t('upload.paste')}</span>
	<span class="muted small">
		{t('upload.hintImages')}{data.config.allowVideo ? `, ${t('upload.hintVideos')}` : ''}
	</span>
</label>

{#if items.length > 0}
	<div class="toolbar">
		<button class="btn text small" onclick={clearFinished} disabled={!items.some((i) => i.status === 'done')}>
			{t('upload.clear')}
		</button>
	</div>

	<ul class="queue">
		{#each items as item (item.id)}
			<li class="card">
				<div class="thumb">
					{#if item.status === 'done' && item.result?.kind === 'image'}
						<img src={item.result.url} alt="" loading="lazy" crossorigin="anonymous" />
					{:else if item.preview && !item.previewFailed}
						<img src={item.preview} alt="" onerror={() => (item.previewFailed = true)} />
					{:else}
						<Icon name={item.file.type.startsWith('video/') || item.result?.kind === 'video' ? 'movie' : 'file'} size={28} />
					{/if}
				</div>

				<div class="info">
					<div class="name" title={item.file.name}>{item.file.name}</div>
					<div class="meta">
						<span class="chip status {item.status}">{t(`upload.status.${item.status}`)}</span>
						{#if item.result}
							<span class="muted">
								{item.result.format.toUpperCase()} · {formatSize(item.result.size)}
								{#if item.result.width}· {item.result.width}×{item.result.height}{/if}
								· {t(`upload.engine.${item.result.engine}`)}
							</span>
						{:else if item.error}
							<span class="error-text">{item.error}</span>
						{:else}
							<span class="muted">{formatSize(item.file.size)}</span>
						{/if}
					</div>
					{#if item.result}
						<a class="url" href={item.result.url} target="_blank" rel="noreferrer">{item.result.url}</a>
					{/if}
				</div>

				{#if item.result}
					<div class="copy">
						{#each LINK_FORMATS as format (format)}
							<button class="btn tonal small" onclick={() => copy(item, format)}>
								{#if format === 'url'}<Icon name="copy" size={16} />{/if}
								{t(`copy.${format}`)}
							</button>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.dropzone {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 56px 24px;
		border: 2px dashed var(--outline);
		border-radius: var(--radius-l);
		background: var(--surface);
		text-align: center;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background-color 0.15s;
	}
	.dropzone:hover,
	.dropzone.dragging,
	.dropzone:focus-within {
		border-color: var(--primary);
		background: color-mix(in srgb, var(--surface), var(--primary) 5%);
	}
	.dropzone .icon {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		margin-bottom: 8px;
		border-radius: 50%;
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.small {
		font-size: 0.8125rem;
	}

	.toolbar {
		display: flex;
		justify-content: flex-end;
		margin: 16px 0 8px;
	}

	.queue {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.queue li {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px;
		border-radius: var(--radius);
	}
	.thumb {
		display: grid;
		place-items: center;
		flex: none;
		width: 64px;
		height: 64px;
		overflow: hidden;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		color: var(--text-2);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.name,
	.url {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		font-weight: 500;
	}
	.url {
		font-family: var(--mono);
		font-size: 0.8125rem;
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.8125rem;
	}
	.status.processing,
	.status.uploading {
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.status.done {
		background: color-mix(in srgb, var(--surface), var(--success) 18%);
		color: var(--success);
	}
	.status.error {
		background: var(--danger-container);
		color: var(--on-danger-container);
	}
	.error-text {
		color: var(--danger);
	}
	.copy {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}

	@media (max-width: 640px) {
		.queue li {
			flex-wrap: wrap;
		}
		.copy {
			width: 100%;
			justify-content: flex-start;
		}
	}
</style>
