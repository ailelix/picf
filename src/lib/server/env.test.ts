import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGING_SETTINGS } from '$lib/imaging/core';
import { loadConfig, mediaBase, type ConfigResult } from './env';

/** 只包含必填项的最小配置 */
const REQUIRED = { ADMIN_USER: 'admin', ADMIN_PASSWORD: 'secret', R2_PUBLIC_URL: 'img.example.com' };
const load = (vars: Record<string, unknown>, dev = false) => loadConfig(vars as unknown as Env, { dev });
const issues = (result: ConfigResult) => (result.ok ? [] : result.issues.map((i) => `${i.name}:${i.problem}`));

describe('loadConfig：必填项', () => {
	it('只填必填项时，选填项全部使用默认值', () => {
		const result = load(REQUIRED);
		expect(result).toEqual({
			ok: true,
			config: {
				admin: { user: 'admin', password: 'secret' },
				r2PublicUrl: 'https://img.example.com',
				cfImage: true,
				imaging: DEFAULT_IMAGING_SETTINGS,
				allowAnonymous: false,
				allowVideo: true,
				timeZone: 'UTC'
			}
		});
	});

	it('必填项未设置或为空时报错，一次列出所有问题', () => {
		expect(issues(load({}))).toEqual(['ADMIN_USER:missing', 'ADMIN_PASSWORD:missing', 'R2_PUBLIC_URL:missing']);
		expect(issues(load({ ...REQUIRED, ADMIN_USER: '  ', ADMIN_PASSWORD: '' }))).toEqual([
			'ADMIN_USER:missing',
			'ADMIN_PASSWORD:missing'
		]);
	});

	it('R2_PUBLIC_URL 值无效时报错', () => {
		expect(issues(load({ ...REQUIRED, R2_PUBLIC_URL: 'ftp://x' }))).toEqual(['R2_PUBLIC_URL:invalid']);
	});

	it('本地开发时 R2_PUBLIC_URL 可以不填，但填了无效值仍然报错', () => {
		const { R2_PUBLIC_URL: _, ...rest } = REQUIRED;
		const result = load(rest, true);
		expect(result.ok && result.config.r2PublicUrl).toBeNull();
		expect(issues(load({ ...rest, R2_PUBLIC_URL: 'ftp://x' }, true))).toEqual(['R2_PUBLIC_URL:invalid']);
	});

	it('密码保留首尾空格', () => {
		const result = load({ ...REQUIRED, ADMIN_PASSWORD: ' p ' });
		expect(result.ok && result.config.admin.password).toBe(' p ');
	});
});

describe('loadConfig：选填项', () => {
	it('解析各项合法值，忽略大小写和首尾空格', () => {
		const result = load({
			...REQUIRED,
			CF_IMAGE: ' OFF ',
			CONVERT_FORMATS: 'JPG, png tif,heif,jpeg',
			CONVERT_TO: 'avif',
			QUALITY: '60',
			MAX_EDGE: '2560',
			ALLOW_ANONYMOUS: 'yes',
			ALLOW_VIDEO: 'Off',
			TIMEZONE: 'asia/shanghai'
		});
		expect(result.ok && result.config).toMatchObject({
			cfImage: false,
			imaging: { convert: ['jpeg', 'png', 'tiff', 'heic'], convertTo: 'avif', quality: 60, maxEdge: 2560 },
			allowAnonymous: true,
			allowVideo: false,
			timeZone: 'Asia/Shanghai'
		});
	});

	it('CONVERT_FORMATS=none 表示都不转换', () => {
		const result = load({ ...REQUIRED, CONVERT_FORMATS: 'none' });
		expect(result.ok && result.config.imaging.convert).toEqual([]);
	});

	it('空值视为未设置，使用默认值', () => {
		const result = load({ ...REQUIRED, QUALITY: '', CONVERT_FORMATS: ' ', CF_IMAGE: '' });
		expect(result.ok && result.config).toMatchObject({ cfImage: true, imaging: DEFAULT_IMAGING_SETTINGS });
	});

	it.each([
		['CF_IMAGE', 'maybe'],
		['CONVERT_FORMATS', 'jpeg,jxl'],
		['CONVERT_FORMATS', 'none,png'],
		['CONVERT_TO', 'gif'],
		['CONVERT_TO', 'bmp'],
		['QUALITY', '0'],
		['QUALITY', '101'],
		['QUALITY', '80.5'],
		['QUALITY', 'high'],
		['MAX_EDGE', '0'],
		['MAX_EDGE', '-1'],
		['ALLOW_ANONYMOUS', 'y'],
		['ALLOW_VIDEO', 'enabled'],
		['TIMEZONE', 'Beijing'],
		['TIMEZONE', 'UTC+8']
	])('%s=%j 值无效时报错', (name, value) => {
		expect(issues(load({ ...REQUIRED, [name]: value }))).toEqual([`${name}:invalid`]);
	});

	it('控制台里设置为 JSON 类型的布尔值和数字也能识别', () => {
		const result = load({ ...REQUIRED, ALLOW_VIDEO: false, QUALITY: 90 });
		expect(result.ok && result.config).toMatchObject({ allowVideo: false, imaging: { quality: 90 } });
	});

	it('忽略不认识的变量', () => {
		expect(load({ ...REQUIRED, SOMETHING_ELSE: 'x', quality: 'bad' }).ok).toBe(true);
	});
});

describe('mediaBase', () => {
	it('有 R2 公共域名时用它，否则走本站的 /i/ 路由', () => {
		const result = load(REQUIRED);
		if (!result.ok) throw new Error('unexpected');
		expect(mediaBase(result.config, 'http://localhost:5173')).toBe('https://img.example.com');
		expect(mediaBase({ ...result.config, r2PublicUrl: null }, 'http://localhost:5173')).toBe('http://localhost:5173/i');
	});
});
