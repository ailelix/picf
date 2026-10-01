import type { Engine, ImageList, Uploader } from '$lib/api';

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 12;

/** 12 位 base62 随机 ID；拒绝采样避免取模偏差 */
function newId(): string {
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
function objectKey(id: string, extension: string, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
		.formatToParts(new Date())
		.reduce<Record<string, string>>((acc, { type, value }) => ((acc[type] = value), acc), {});
	return `${parts.year}/${parts.month}/${parts.day}/${id}.${extension}`;
}

interface SaveInput {
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

/** 图片和视频都存在 images 表里；返回 R2 key（即 images.url 列，如 2026/09/28/aB3dE5fG7hJ9.webp） */
export async function saveImage(env: Pick<Env, 'BUCKET' | 'DB'>, input: SaveInput): Promise<string> {
	const id = newId();
	const key = objectKey(id, input.extension, input.timeZone);
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
		await env.DB.prepare('INSERT INTO images (id, url) VALUES (?, ?)').bind(id, key).run();
		return key;
	} catch (error) {
		await env.BUCKET.delete(key);
		throw error;
	}
}

/** 图片管理页每页数量 */
const PAGE_SIZE = 30;

/**
 * 按时间倒序分页，`base` 是文件链接的前缀。游标是上一页最后一条的 `created_at:id`；
 * 没有游标时从一个比所有记录都大的位置开始，这样第一页和后续页可以用同一条查询。
 */
export async function listImages(db: D1Database, base: string, cursor: string | null): Promise<ImageList> {
	const match = cursor?.match(/^(\d+):([0-9A-Za-z]+)$/);
	const after = match ? [Number(match[1]), match[2]] : [Number.MAX_SAFE_INTEGER, ''];
	const { results } = await db
		.prepare(
			'SELECT id, url, created_at FROM images WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?'
		)
		.bind(...after, PAGE_SIZE + 1)
		.all<{ id: string; url: string; created_at: number }>();

	const items = results
		.slice(0, PAGE_SIZE)
		.map((r) => ({ id: r.id, key: r.url, url: `${base}/${r.url}`, createdAt: r.created_at }));
	const last = items.at(-1);
	return { items, cursor: results.length > PAGE_SIZE && last ? `${last.createdAt}:${last.id}` : null };
}

/** 先删数据库记录再删文件：即使删文件失败，也只是 R2 里留下孤儿文件，不会出现指向不存在文件的记录 */
export async function deleteImage(env: Pick<Env, 'BUCKET' | 'DB'>, id: string): Promise<boolean> {
	const row = await env.DB.prepare('DELETE FROM images WHERE id = ? RETURNING url').bind(id).first<{ url: string }>();
	if (!row) return false;
	await env.BUCKET.delete(row.url);
	return true;
}
