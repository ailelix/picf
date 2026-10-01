/// <reference lib="webworker" />
import Vips from 'wasm-vips';
import vipsWasm from 'wasm-vips/vips.wasm?url';
import heifWasm from 'wasm-vips/vips-heif.wasm?url';
import resvgWasm from 'wasm-vips/vips-resvg.wasm?url';
import { MIME_TYPES, type ImageFormat } from './formats';
import type { TransformSpec } from './planner';
import type { WorkerRequest, WorkerResponse } from './wasm';

declare const self: DedicatedWorkerGlobalScope;

type VipsModule = Awaited<ReturnType<typeof Vips>>;
type VipsImage = InstanceType<VipsModule['Image']>;

const WASM_URLS: Record<string, string> = {
	'vips.wasm': vipsWasm,
	// HEIF 模块提供 AVIF 编解码，resvg 模块提供 SVG 渲染；不加载 JPEG XL 模块
	'vips-heif.wasm': heifWasm,
	'vips-resvg.wasm': resvgWasm
};

/** vips 读不了、交给浏览器原生解码的格式 */
const NATIVE_DECODE_FORMATS = new Set<ImageFormat>(['bmp', 'ico']);
/** 可能是动图、vips 加载时支持 n 参数的输入格式 */
const ANIMATED_INPUTS = new Set<ImageFormat>(['gif', 'webp']);

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

self.onmessage = async ({ data: { bytes, format, spec } }: MessageEvent<WorkerRequest>) => {
	let response: WorkerResponse;
	try {
		response = { ok: true, bytes: await transform(await getVips(), bytes, format, spec) };
	} catch (error) {
		response = { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(response, response.ok ? [response.bytes.buffer] : []);
};

/**
 * 按 spec 转换图片，语义与 CF Images 保持一致：
 * - 输入是动图且输出 WebP 时保留动画，否则取第一帧
 * - 转换到 sRGB 后去除全部元数据
 * - 透明图输出 JPEG 时铺白底
 */
async function transform(vips: VipsModule, bytes: Uint8Array, format: ImageFormat, spec: TransformSpec) {
	const images: VipsImage[] = [];
	const track = (image: VipsImage) => (images.push(image), image);

	try {
		let image: VipsImage;
		if (NATIVE_DECODE_FORMATS.has(format)) {
			const { data, width, height } = await decodeNative(bytes, format);
			const raw = track(vips.Image.newFromMemory(data, width, height, 4, vips.BandFormat.uchar));
			image = track(raw.copy({ interpretation: 'srgb' }));
		} else {
			const keepFrames = ANIMATED_INPUTS.has(format) && spec.format === 'webp';
			image = track(vips.Image.newFromBuffer(bytes, keepFrames ? 'n=-1' : ''));
			// 按 EXIF 方向转正，因为之后元数据会被去掉。动图的各帧纵向拼在一起，不能整体旋转（动图也极少带方向信息）
			if (!keepFrames) image = track(image.autorot());
		}

		if (image.getTypeof('icc-profile-data')) {
			// 去掉 ICC 之前先转换到 sRGB，否则广色域（如 iPhone 的 Display P3）照片会偏色
			image = track(image.iccTransform('srgb'));
		}
		if (spec.format === 'jpeg' && image.hasAlpha()) {
			image = track(image.flatten({ background: [255, 255, 255] }));
		}
		return image.writeToBuffer(`.${spec.format}`, encoderOptions(spec));
	} finally {
		for (const image of images) image.delete();
	}
}

function encoderOptions({ format, quality }: TransformSpec): Record<string, unknown> {
	switch (format) {
		case 'png':
			return { keep: 'none' }; // PNG 无损，quality 不适用
		case 'jpeg':
			// 与 CF 一致输出渐进式 JPEG
			return { keep: 'none', Q: quality, interlace: true, optimize_coding: true };
		default:
			return { keep: 'none', Q: quality };
	}
}

/**
 * 用浏览器原生解码成 RGBA 像素。createImageBitmap 默认会按 EXIF 方向转正，
 * 画到 canvas 时会转换到 sRGB。
 */
async function decodeNative(bytes: Uint8Array, format: ImageFormat) {
	const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: MIME_TYPES[format] }));
	const { width, height } = bitmap;
	const context = new OffscreenCanvas(width, height).getContext('2d')!;
	context.drawImage(bitmap, 0, 0);
	bitmap.close();
	const { data } = context.getImageData(0, 0, width, height);
	// 同一块内存的 Uint8Array 视图，不复制
	return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height };
}
