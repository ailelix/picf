import type { ImageFormat } from './formats';
import type { TransformSpec } from './planner';

export interface WorkerRequest {
	bytes: Uint8Array;
	format: ImageFormat;
	spec: TransformSpec;
}

export type WorkerResponse = { ok: true; bytes: Uint8Array } | { ok: false; message: string };

/** wasm-vips 依赖 SharedArrayBuffer，页面必须处于跨域隔离状态（COOP/COEP 响应头） */
export function isWasmAvailable(): boolean {
	return (
		typeof WebAssembly === 'object' &&
		typeof Worker === 'function' &&
		typeof OffscreenCanvas === 'function' &&
		globalThis.crossOriginIsolated === true
	);
}

const TIMEOUT_MS = 120_000;

let worker: Worker | undefined;
/** 任务串行执行：vips 内部已经多线程，并行只会抢内存；也让超时只从真正开始处理时计算 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * 在 Web Worker 里用 wasm-vips 处理图片。原始 bytes 会被复制，调用方仍可继续使用
 * （例如处理失败后原样上传）。
 */
export function transformWithWasm(bytes: Uint8Array, format: ImageFormat, spec: TransformSpec): Promise<Uint8Array> {
	const task = queue.then(() => run({ bytes, format, spec }));
	queue = task.catch(() => {});
	return task;
}

function run(request: WorkerRequest): Promise<Uint8Array> {
	const current = (worker ??= new Worker(new URL('./wasm.worker.ts', import.meta.url), { type: 'module' }));
	return new Promise((resolve, reject) => {
		// 超时或 Worker 崩溃时终止 Worker，释放卡住的 WASM 内存；下一个任务会重新创建
		const fail = (message: string) => {
			clearTimeout(timer);
			current.terminate();
			worker = undefined;
			reject(new Error(message));
		};
		const timer = setTimeout(() => fail('WASM 处理超时'), TIMEOUT_MS);

		current.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
			clearTimeout(timer);
			if (data.ok) resolve(data.bytes);
			else reject(new Error(data.message));
		};
		current.onerror = (event) => {
			event.preventDefault();
			fail(`WASM Worker 出错：${event.message}`);
		};
		current.postMessage(request);
	});
}
