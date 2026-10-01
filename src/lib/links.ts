import { VIDEO_FORMATS, type VideoFormat } from '$lib/video';

export const LINK_FORMATS = ['url', 'markdown', 'html'] as const;
export type LinkFormat = (typeof LINK_FORMATS)[number];
export type MediaKind = 'image' | 'video';

/** 列表接口只返回 key，按扩展名判断是图片还是视频 */
export function mediaKind(key: string): MediaKind {
	const extension = key.split('.').pop()?.toLowerCase();
	return VIDEO_FORMATS.includes(extension as VideoFormat) ? 'video' : 'image';
}

export function formatLink(format: LinkFormat, url: string, kind: MediaKind, name = ''): string {
	switch (format) {
		case 'url':
			return url;
		case 'markdown':
			// Markdown 没有视频语法，视频用普通链接
			return kind === 'video' ? `[${escapeMarkdown(name || url)}](${url})` : `![${escapeMarkdown(name)}](${url})`;
		case 'html':
			return kind === 'video'
				? `<video src="${escapeHtml(url)}" controls></video>`
				: `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}">`;
	}
}

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function escapeMarkdown(text: string) {
	return text.replace(/[[\]\\]/g, '\\$&');
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
}
