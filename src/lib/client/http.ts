/** 请求失败时抛出；code 对应接口返回的 error 字段，body 是完整的响应体 */
export class ApiRequestError extends Error {
	override name = 'ApiRequestError';

	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly body: Record<string, unknown> = {}
	) {
		super(message);
	}
}

/** 请求 JSON 接口，非 2xx 时抛出 ApiRequestError；没有响应体（如 204）时返回空对象 */
export async function requestJson<T>(input: string, init?: RequestInit, fetchImpl = fetch): Promise<T> {
	const response = await fetchImpl(input, init);
	const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (!response.ok) {
		throw new ApiRequestError(
			response.status,
			String(body.error ?? 'HTTP_ERROR'),
			String(body.message ?? response.statusText),
			body
		);
	}
	return body as T;
}
