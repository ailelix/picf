/// <reference lib="webworker" />
import Vips from 'wasm-vips';
import vipsWasm from 'wasm-vips/vips.wasm?url';
import heifWasm from 'wasm-vips/vips-heif.wasm?url';
import resvgWasm from 'wasm-vips/vips-resvg.wasm?url';
import { ImagingError } from '../core/errors';
import { decodeNative, NATIVE_DECODE_FORMATS } from './native';
import { transformWithVips, type VipsModule } from './vips';
import type { WorkerRequest, WorkerResponse } from './wasm';

declare const self: DedicatedWorkerGlobalScope;

const WASM_URLS: Record<string, string> = {
	'vips.wasm': vipsWasm,
	// HEIF 模块提供 AVIF 编解码，resvg 模块提供 SVG 渲染；不加载 JPEG XL 模块
	'vips-heif.wasm': heifWasm,
	'vips-resvg.wasm': resvgWasm
};

let vips: Promise<VipsModule> | undefined;

function getVips() {
	vips ??= Vips({
		dynamicLibraries: ['vips-heif.wasm', 'vips-resvg.wasm'],
		locateFile: (file, dir) => WASM_URLS[file] ?? dir + file
	}).catch((error) => {
		vips = undefined; // 初始化失败（如 wasm 下载失败）时下次重试，而不是一直返回同一个失败
		throw error;
	});
	return vips;
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
	const { id, bytes, format, spec } = data;
	let response: WorkerResponse;
	try {
		const input = NATIVE_DECODE_FORMATS.has(format) ? await decodeNative(bytes, format) : bytes;
		const result = transformWithVips(await getVips(), input, format, spec);
		response = { id, ok: true, result };
	} catch (error) {
		const code = error instanceof ImagingError ? error.code : 'FAILED';
		response = { id, ok: false, code, message: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(response, response.ok ? [response.result.bytes.buffer] : []);
};
