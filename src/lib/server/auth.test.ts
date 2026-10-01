import { describe, expect, it } from 'vitest';
import {
	checkCredentials,
	createSession,
	parseBasicAuth,
	SESSION_TTL_SECONDS,
	verifySession
} from './auth';

const creds = { user: 'admin', password: 'p@ss:word' };

describe('checkCredentials', () => {
	it('用户名和密码都对才通过', async () => {
		expect(await checkCredentials(creds, 'admin', 'p@ss:word')).toBe(true);
		expect(await checkCredentials(creds, 'admin', 'wrong')).toBe(false);
		expect(await checkCredentials(creds, 'root', 'p@ss:word')).toBe(false);
		expect(await checkCredentials(creds, '', '')).toBe(false);
	});
});

describe('parseBasicAuth', () => {
	const header = (s: string) => 'Basic ' + btoa(s);

	it('密码里可以有冒号', () => {
		expect(parseBasicAuth(header('admin:p@ss:word'))).toEqual(creds);
	});

	it('支持 UTF-8 用户名', () => {
		const utf8 = String.fromCharCode(...new TextEncoder().encode('管理员:密码'));
		expect(parseBasicAuth('Basic ' + btoa(utf8))).toEqual({ user: '管理员', password: '密码' });
	});

	it.each([null, '', 'Bearer abc', 'Basic', 'Basic !!!', header('no-colon')])('非法输入返回 null：%j', (h) => {
		expect(parseBasicAuth(h)).toBeNull();
	});
});

describe('session', () => {
	const now = Date.UTC(2026, 8, 28);

	it('签发的令牌可以通过校验', async () => {
		const token = await createSession(creds, now);
		expect(await verifySession(creds, token, now)).toBe(true);
	});

	it('过期后失效', async () => {
		const token = await createSession(creds, now);
		expect(await verifySession(creds, token, now + SESSION_TTL_SECONDS * 1000 - 1)).toBe(true);
		expect(await verifySession(creds, token, now + SESSION_TTL_SECONDS * 1000)).toBe(false);
	});

	it('改密码后旧令牌失效', async () => {
		const token = await createSession(creds, now);
		expect(await verifySession({ ...creds, password: 'new' }, token, now)).toBe(false);
	});

	it('篡改过期时间或签名都会失效', async () => {
		const token = await createSession(creds, now);
		const [expires, signature] = token.split('.');
		expect(await verifySession(creds, `${Number(expires) + 1}.${signature}`, now)).toBe(false);
		expect(await verifySession(creds, `${expires}.${signature.slice(1)}A`, now)).toBe(false);
	});

	it.each([undefined, '', 'abc', '123.', '.abc', '123.abc.def'])('格式错误的令牌：%j', async (token) => {
		expect(await verifySession(creds, token, now)).toBe(false);
	});
});
