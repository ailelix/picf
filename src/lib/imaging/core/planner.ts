import { checkSupport, ENGINES, type EngineName } from './capabilities';
import type { ImagingErrorCode } from './errors';
import type { ImageInfo } from './formats';
import type { ImagingSettings } from './settings';
import type { TransformSpec } from './spec';

/** 引擎按此顺序尝试：CF 优先，失败再降级到 WASM */
const ENGINE_ORDER: readonly EngineName[] = ['cf', 'wasm'];

export interface PlanContext {
	/** env.CF_IMAGE */
	cfEnabled: boolean;
	/** 浏览器上传时为 true；API 上传（PicGo 等）没有浏览器参与，为 false */
	wasmAvailable: boolean;
}

export interface Rejection {
	engine: EngineName;
	code: ImagingErrorCode;
}

export type Plan =
	/** 设置里该格式不转换，原样保存 */
	| { kind: 'store'; reason: 'NO_CONVERSION' }
	/** 需要转换但没有引擎能处理，原样保存 */
	| { kind: 'store'; reason: 'NO_ENGINE'; rejected: Rejection[] }
	/** engines 按顺序尝试，前一个运行时失败就换下一个 */
	| { kind: 'transform'; spec: TransformSpec; engines: EngineName[]; rejected: Rejection[] };

/** 按设置生成变换参数；该格式不需要转换时返回 null */
function buildSpec(info: ImageInfo, settings: ImagingSettings): TransformSpec | null {
	if (!settings.convert.includes(info.format)) return null;

	const spec: TransformSpec = { format: settings.convertTo, quality: settings.quality };
	if (settings.maxEdge !== null) spec.width = spec.height = settings.maxEdge;
	return spec;
}

export function plan(info: ImageInfo, settings: ImagingSettings, ctx: PlanContext): Plan {
	const spec = buildSpec(info, settings);
	if (!spec) return { kind: 'store', reason: 'NO_CONVERSION' };

	const enabled: Record<EngineName, boolean> = { cf: ctx.cfEnabled, wasm: ctx.wasmAvailable };
	const engines: EngineName[] = [];
	const rejected: Rejection[] = [];
	for (const engine of ENGINE_ORDER) {
		const code = enabled[engine] ? checkSupport(ENGINES[engine], info, spec) : 'UNAVAILABLE';
		if (code) rejected.push({ engine, code });
		else engines.push(engine);
	}

	return engines.length > 0
		? { kind: 'transform', spec, engines, rejected }
		: { kind: 'store', reason: 'NO_ENGINE', rejected };
}
