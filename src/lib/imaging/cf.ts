import { MIME_TYPES } from './formats';
import type { TransformSpec } from './planner';

/**
 * 用 Cloudflare Images binding 按 spec 转换图片，失败时抛错，由调用方决定是否降级。
 * binding 的输出总会去除元数据，与 WASM 端一致。错误信息里的代码含义（如 9422 表示本月额度用完）见
 * https://developers.cloudflare.com/images/reference/troubleshooting/
 */
export async function transformWithCf(images: ImagesBinding, input: Blob, spec: TransformSpec): Promise<Uint8Array> {
	const mime = MIME_TYPES[spec.format] as ImageOutputOptions['format'];
	let transformer = images.input(input.stream());
	if (spec.maxEdge !== null) {
		transformer = transformer.transform({ width: spec.maxEdge, height: spec.maxEdge, fit: 'scale-down' });
	}
	const result = await transformer.output({ format: mime, quality: spec.quality });
	const bytes = new Uint8Array(await new Response(result.image()).arrayBuffer());

	// 输出超出限制时 CF 会静默改用其他格式（如 AVIF 超过 1200px），视为失败
	if (result.contentType() !== mime) throw new Error(`CF Images 返回了 ${result.contentType()}，期望 ${mime}`);
	return bytes;
}
