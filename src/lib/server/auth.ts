export const SESSION_COOKIE = 'picf_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface Credentials {
	user: string;
	password: string;
}

const encoder = new TextEncoder();

/** 恒定时间比较：先各自哈希成等长摘要，且用户名和密码都比完才出结果 */
export async function checkCredentials(expected: Credentials, user: string, password: string) {
	const [userOk, passwordOk] = await Promise.all([
		digestEquals(expected.user, user),
		digestEquals(expected.password, password)
	]);
	return userOk && passwordOk;
}

/** 解析 `Authorization: Basic base64(user:password)`，格式不对返回 null */
export function parseBasicAuth(header: string | null): { user: string; password: string } | null {
	const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
	if (!match) return null;
	let decoded: string;
	try {
		decoded = new TextDecoder().decode(Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)));
	} catch {
		return null;
	}
	const colon = decoded.indexOf(':');
	if (colon < 0) return null;
	return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * 会话令牌格式：`<过期时间戳>.<HMAC 签名>`，不需要服务端存储。
 * 签名密钥由用户名和密码派生，改密码后所有旧会话自动失效。
 */
export async function createSession(credentials: Credentials, now = Date.now()): Promise<string> {
	const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
	const key = await sessionKey(credentials, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`session:${expires}`));
	return `${expires}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
	credentials: Credentials,
	token: string | undefined,
	now = Date.now()
): Promise<boolean> {
	const match = token?.match(/^(\d+)\.([A-Za-z0-9_-]+)$/);
	if (!match) return false;
	const expires = Number(match[1]);
	if (expires * 1000 <= now) return false;

	const signature = fromBase64Url(match[2]);
	if (!signature) return false;
	const key = await sessionKey(credentials, ['verify']);
	// crypto.subtle.verify 本身是恒定时间比较
	return crypto.subtle.verify('HMAC', key, signature, encoder.encode(`session:${expires}`));
}

function sessionKey({ user, password }: Credentials, usages: KeyUsage[]) {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(`picf-session\0${user}\0${password}`),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		usages
	);
}

async function digestEquals(a: string, b: string): Promise<boolean> {
	const [da, db] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b))
	]);
	const x = new Uint8Array(da);
	const y = new Uint8Array(db);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
	try {
		return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}
