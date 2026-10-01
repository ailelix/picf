import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ClientConfig, UploadedImage } from '$lib/api';
import { DEFAULT_IMAGING_SETTINGS, ImagingError, type TransformSpec } from '$lib/imaging/core';
import { ApiRequestError } from './http';
import { uploadImage, type UploadDeps } from './upload';

const fixture = (name: string, type = 'application/octet-stream') =>
	new File([readFileSync(new URL(`../imaging/core/fixtures/${name}`, import.meta.url))], name, { type });

const config: ClientConfig = { cfEnabled: true, imaging: DEFAULT_IMAGING_SETTINGS, allowVideo: false };
const spec: TransformSpec = { format: 'webp', quality: 80 };
const saved = (engine: UploadedImage['engine']): UploadedImage => ({
	id: 'abc',
	key: '2026/09/abc.webp',
	url: 'http://x/i/2026/09/abc.webp',
	createdAt: 0,
	kind: 'image',
	format: 'webp',
	size: 1,
	engine
});

/** 按顺序返回预设响应的假服务端，记录每次请求的 mode 和文件 */
function fakeServer(...responses: [number, unknown][]) {
	const requests: { mode: string; file: File }[] = [];
	const fetch = vi.fn(async (_url: string, init: RequestInit) => {
		const form = init.body as FormData;
		requests.push({ mode: form.get('mode') as string, file: form.get('file') as File });
		const [status, body] = responses.shift()!;
		return Response.json(body, { status });
	});
	return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}

function deps(server: ReturnType<typeof fakeServer>, overrides: Partial<UploadDeps> = {}): UploadDeps {
	return {
		wasmAvailable: true,
		transform: vi.fn(async () => ({ bytes: new Uint8Array([9, 9]), width: 30, height: 20 })),
		fetch: server.fetch,
		...overrides
	};
}

describe('uploadImage', () => {
	it('不需要转换的格式以 raw 模式上传', async () => {
		const server = fakeServer([201, saved('none')]);
		await uploadImage(fixture('anim.gif'), config, deps(server));
		expect(server.requests.map((r) => r.mode)).toEqual(['raw']);
	});

	it('CF 能处理时交给服务端，成功后不调用 WASM', async () => {
		const server = fakeServer([201, saved('cf')]);
		const d = deps(server);
		expect(await uploadImage(fixture('photo.jpg'), config, d)).toEqual(saved('cf'));
		expect(server.requests.map((r) => r.mode)).toEqual(['fallback']);
		expect(d.transform).not.toHaveBeenCalled();
	});

	it('服务端返回 422 时按返回的 spec 用 WASM 处理后以 processed 上传', async () => {
		const serverSpec = { ...spec, quality: 55 };
		const server = fakeServer(
			[422, { error: 'CLIENT_PROCESSING_REQUIRED', spec: serverSpec, reasons: [] }],
			[201, saved('wasm')]
		);
		const d = deps(server);
		expect(await uploadImage(fixture('photo.jpg'), config, d)).toEqual(saved('wasm'));
		expect(d.transform).toHaveBeenCalledWith(expect.any(Uint8Array), 'jpeg', serverSpec);
		expect(server.requests.map((r) => r.mode)).toEqual(['fallback', 'processed']);

		const processed = server.requests[1].file;
		expect(processed.name).toBe('photo.jpg');
		expect(processed.type).toBe('image/webp');
		expect(new Uint8Array(await processed.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
	});

	it('CF 不支持的格式直接在本地处理，只请求一次', async () => {
		const server = fakeServer([201, saved('wasm')]);
		const d = deps(server);
		await uploadImage(fixture('still.tif'), config, d);
		expect(d.transform).toHaveBeenCalledWith(expect.any(Uint8Array), 'tiff', spec);
		expect(server.requests.map((r) => r.mode)).toEqual(['processed']);
	});

	it('WASM 处理失败时原样上传', async () => {
		const server = fakeServer([201, saved('none')]);
		const transform = vi.fn(async () => {
			throw new ImagingError('FAILED', 'boom');
		});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await uploadImage(fixture('still.tif'), config, deps(server, { transform }));
		expect(server.requests.map((r) => r.mode)).toEqual(['raw']);
		expect(server.requests[0].file.name).toBe('still.tif');
	});

	it('浏览器不能用 WASM 时：CF 能处理的用 auto，处理不了的原样上传', async () => {
		const server = fakeServer([201, saved('cf')], [201, saved('none')]);
		const d = deps(server, { wasmAvailable: false });
		await uploadImage(fixture('photo.jpg'), config, d);
		await uploadImage(fixture('still.tif'), config, d);
		expect(server.requests.map((r) => r.mode)).toEqual(['auto', 'raw']);
		expect(d.transform).not.toHaveBeenCalled();
	});

	it('CF 关闭时直接用 WASM', async () => {
		const server = fakeServer([201, saved('wasm')]);
		await uploadImage(fixture('photo.jpg'), { ...config, cfEnabled: false }, deps(server));
		expect(server.requests.map((r) => r.mode)).toEqual(['processed']);
	});

	it('视频：开启后原样上传，未开启时不发请求', async () => {
		const video = new File([readFileSync(new URL('../fixtures/clip.mp4', import.meta.url))], 'clip.mp4');
		const server = fakeServer([201, { ...saved('none'), kind: 'video', format: 'mp4' }]);
		const d = deps(server);
		await uploadImage(video, { ...config, allowVideo: true }, d);
		expect(server.requests.map((r) => r.mode)).toEqual(['raw']);
		expect(d.transform).not.toHaveBeenCalled();

		await expect(uploadImage(video, config, d)).rejects.toMatchObject({ status: 403, code: 'VIDEO_DISABLED' });
		expect(server.requests).toHaveLength(1);
	});

	it('超过大小上限时不发请求', async () => {
		const server = fakeServer();
		const big = fixture('photo.jpg');
		Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
		await expect(uploadImage(big, config, deps(server))).rejects.toMatchObject({ status: 413 });
		expect(server.requests).toEqual([]);
	});

	it('无法识别的文件不发请求', async () => {
		const server = fakeServer();
		const file = new File(['hello'], 'a.txt');
		await expect(uploadImage(file, config, deps(server))).rejects.toMatchObject({ status: 415 });
		expect(server.requests).toEqual([]);
	});

	it('服务端错误转为 ApiRequestError', async () => {
		const server = fakeServer([401, { error: 'UNAUTHORIZED', message: '未登录' }]);
		const error = await uploadImage(fixture('anim.gif'), config, deps(server)).catch((e) => e);
		expect(error).toBeInstanceOf(ApiRequestError);
		expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message: '未登录' });
	});

	it('依次报告处理阶段', async () => {
		const server = fakeServer([201, saved('wasm')]);
		const stages: string[] = [];
		await uploadImage(fixture('still.tif'), config, deps(server, { onStage: (s) => stages.push(s) }));
		expect(stages).toEqual(['processing', 'uploading']);
	});
});
