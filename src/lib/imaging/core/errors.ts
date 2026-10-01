export type ImagingErrorCode =
	/** 引擎在当前环境不可用：CF_IMAGE 关闭，或服务端没有 WASM */
	| 'UNAVAILABLE'
	| 'UNSUPPORTED_INPUT'
	| 'UNSUPPORTED_OUTPUT'
	/** 文件体积超过引擎上限 */
	| 'TOO_LARGE'
	/** 输入或输出的宽高、面积超过引擎上限 */
	| 'DIMENSIONS_EXCEEDED'
	/** CF Images 本月额度用完（9422） */
	| 'QUOTA_EXCEEDED'
	/** 运行时的其他错误 */
	| 'FAILED';

export class ImagingError extends Error {
	override name = 'ImagingError';

	constructor(
		readonly code: ImagingErrorCode,
		message: string = code,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}
