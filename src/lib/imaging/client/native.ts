import { MIME_TYPES, type ImageFormat } from '../core/formats';
import type { DecodedPixels } from './vips';

/** wasm-vips 解码不了、交给浏览器原生解码的格式 */
export const NATIVE_DECODE_FORMATS: ReadonlySet<ImageFormat> = new Set(['bmp', 'ico']);

/**
 * 用浏览器原生解码成 RGBA 像素。createImageBitmap 默认会按 EXIF 方向转正，
 * 画到 canvas 时会转换到 sRGB。主线程和 Worker 里都能用。
 */
export async function decodeNative(bytes: Uint8Array, format: ImageFormat): Promise<DecodedPixels> {
	const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: MIME_TYPES[format] }));
	try {
		const { width, height } = bitmap;
		const context = new OffscreenCanvas(width, height).getContext('2d');
		if (!context) throw new Error('OffscreenCanvas 2d 不可用');
		context.drawImage(bitmap, 0, 0);
		return { data: context.getImageData(0, 0, width, height).data, width, height };
	} finally {
		bitmap.close();
	}
}
