import type { Engine, Uploader } from '$lib/api';

export interface ImageRecord {
	id: string;
	/** R2 key，即 images.url 列，如 2026/09/abc123.webp */
	key: string;
	createdAt: number;
}

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 12;

/** 12 位 base62 随机 ID；拒绝采样避免取模偏差 */
export function newId(): string {
	let id = '';
	while (id.length < ID_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(ID_LENGTH * 2))) {
			const v = byte & 63;
			if (v < ID_ALPHABET.length && id.length < ID_LENGTH) id += ID_ALPHABET[v];
		}
	}
	return id;
}

/** R2 路径：`年/月/日/随机ID.扩展名`，日期按 timeZone 计算 */
export function objectKey(id: string, extension: string, { date = new Date(), timeZone = 'UTC' } = {}): string {
	const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
		.formatToParts(date)
		.reduce<Record<string, string>>((acc, { type, value }) => ((acc[type] = value), acc), {});
	return `${parts.year}/${parts.month}/${parts.day}/${id}.${extension}`;
}

/** 与 objectKey 生成的格式一致，用于在读 R2 之前过滤掉无效路径（本地开发的 /i/ 路由） */
export const OBJECT_KEY_PATTERN = /^\d{4}\/\d{2}\/\d{2}\/[0-9A-Za-z]+\.[a-z0-9]+$/;

export function publicUrl(base: string, key: string): string {
	return `${base}/${key}`;
}

/** 规范化 R2_PUBLIC_URL：允许只写域名（补 https://）或带路径前缀，去掉末尾斜杠；未设置或非法时返回 null */
export function normalizeBaseUrl(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(url.protocol);
		return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
	} catch {
		return null;
	}
}

export interface SaveInput {
	/** 传 Blob（如上传的 File）时直接写入 R2，不会在内存里再复制一份 */
	body: Blob | Uint8Array;
	extension: string;
	contentType: string;
	originalName: string;
	engine: Engine;
	uploader: Uploader;
	/** 路径中的日期按这个时区计算 */
	timeZone: string;
}

/** 图片和视频都存在 images 表里 */
export async function saveImage(env: Pick<Env, 'BUCKET' | 'DB'>, input: SaveInput): Promise<ImageRecord> {
	const id = newId();
	const key = objectKey(id, input.extension, { timeZone: input.timeZone });
	await env.BUCKET.put(key, input.body, {
		httpMetadata: {
			contentType: input.contentType,
			// key 带随机 ID、内容永不变化，可以长期缓存；R2 公共域名会直接返回这里的响应头
			cacheControl: 'public, max-age=31536000, immutable',
			// SVG 可以内嵌脚本：直接打开时下载而不是渲染，用 <img> 引用不受影响
			...(input.contentType === 'image/svg+xml' && { contentDisposition: 'attachment' })
		},
		// 不进数据库的附加信息放在 R2 对象元数据里
		customMetadata: { originalName: input.originalName, engine: input.engine, uploader: input.uploader }
	});

	try {
		const row = await env.DB.prepare('INSERT INTO images (id, url) VALUES (?, ?) RETURNING created_at')
			.bind(id, key)
			.first<{ created_at: number }>();
		return { id, key, createdAt: row!.created_at };
	} catch (error) {
		await env.BUCKET.delete(key);
		throw error;
	}
}

export interface ImagePage {
	items: ImageRecord[];
	/** 下一页的游标，没有更多时为 null */
	cursor: string | null;
}

/** 按时间倒序分页；游标是上一页最后一条的 `created_at:id` */
export async function listImages(db: D1Database, opts: { limit: number; cursor?: string | null }): Promise<ImagePage> {
	const after = parseCursor(opts.cursor);
	const stmt = after
		? db
				.prepare(
					'SELECT id, url, created_at FROM images WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?'
				)
				.bind(after.createdAt, after.id, opts.limit + 1)
		: db.prepare('SELECT id, url, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT ?').bind(opts.limit + 1);

	const { results } = await stmt.all<{ id: string; url: string; created_at: number }>();
	const items = results.slice(0, opts.limit).map((r) => ({ id: r.id, key: r.url, createdAt: r.created_at }));
	const last = items.at(-1);
	return {
		items,
		cursor: results.length > opts.limit && last ? `${last.createdAt}:${last.id}` : null
	};
}

function parseCursor(cursor: string | null | undefined) {
	const match = cursor?.match(/^(\d+):([0-9A-Za-z]+)$/);
	return match ? { createdAt: Number(match[1]), id: match[2] } : null;
}

/** 先删数据库记录再删文件：即使删文件失败，也只是 R2 里留下孤儿文件，不会出现指向不存在文件的记录 */
export async function deleteImage(env: Pick<Env, 'BUCKET' | 'DB'>, id: string): Promise<boolean> {
	const row = await env.DB.prepare('DELETE FROM images WHERE id = ? RETURNING url').bind(id).first<{ url: string }>();
	if (!row) return false;
	await env.BUCKET.delete(row.url);
	return true;
}
