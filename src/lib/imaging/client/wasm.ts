import { ImagingError, type ImagingErrorCode } from '../core/errors';
import type { ImageFormat } from '../core/formats';
import type { TransformSpec } from '../core/spec';
import type { WasmResult } from './vips';

export interface WorkerRequest {
	id: number;
	bytes: Uint8Array;
	format: ImageFormat;
	spec: TransformSpec;
}

export type WorkerResponse =
	| { id: number; ok: true; result: WasmResult }
	| { id: number; ok: false; code: ImagingErrorCode; message: string };

/** wasm-vips 依赖 SharedArrayBuffer，页面必须处于跨域隔离状态（COOP/COEP 响应头） */
export function isWasmAvailable(): boolean {
	return (
		typeof WebAssembly === 'object' &&
		typeof Worker === 'function' &&
		typeof OffscreenCanvas === 'function' &&
		globalThis.crossOriginIsolated === true
	);
}

const DEFAULT_TIMEOUT_MS = 120_000;

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (r: WasmResult) => void; reject: (e: ImagingError) => void }>();

function getWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('./wasm.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
		const task = pending.get(data.id);
		if (!task) return;
		pending.delete(data.id);
		if (data.ok) task.resolve(data.result);
		else task.reject(new ImagingError(data.code, data.message));
	};
	worker.onerror = (event) => {
		event.preventDefault();
		resetWorker(new ImagingError('FAILED', `WASM Worker 出错：${event.message}`));
	};
	return worker;
}

/** 终止 Worker 并让所有进行中的任务失败；下次调用时重新创建 */
function resetWorker(error: ImagingError) {
	worker?.terminate();
	worker = undefined;
	for (const task of pending.values()) task.reject(error);
	pending.clear();
}

/** 任务串行执行：vips 内部已经多线程，并行只会抢内存；也让超时只从真正开始处理时计算 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * 在 Web Worker 里用 wasm-vips 处理图片。原始 bytes 会被复制，调用方仍可继续使用
 * （例如处理失败后原样上传）。超时会终止 Worker，释放卡住的 WASM 内存。
 */
export function transformWithWasm(
	bytes: Uint8Array,
	format: ImageFormat,
	spec: TransformSpec,
	{ timeoutMs = DEFAULT_TIMEOUT_MS } = {}
): Promise<WasmResult> {
	if (!isWasmAvailable()) return Promise.reject(new ImagingError('UNAVAILABLE', '浏览器不支持 WASM 处理'));

	const task = queue.then(() => run(bytes, format, spec, timeoutMs));
	queue = task.catch(() => {});
	return task;
}

function run(bytes: Uint8Array, format: ImageFormat, spec: TransformSpec, timeoutMs: number) {
	const id = nextId++;
	return new Promise<WasmResult>((resolve, reject) => {
		const timer = setTimeout(() => resetWorker(new ImagingError('FAILED', '处理超时')), timeoutMs);
		pending.set(id, {
			resolve: (r) => (clearTimeout(timer), resolve(r)),
			reject: (e) => (clearTimeout(timer), reject(e))
		});
		const request: WorkerRequest = { id, bytes, format, spec };
		getWorker().postMessage(request);
	});
}
