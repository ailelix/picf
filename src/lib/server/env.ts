/**
 * 读取 Cloudflare 绑定，并把环境变量解析成配置。环境变量在 Cloudflare 控制台的「变量和机密」中设置，
 * 本地开发写在 .env，各项含义见 README。规则：
 * - 必填项未设置或值无效：报错
 * - 选填项未设置（或为空）：使用默认值；值无效：报错
 * - 不认识的变量：忽略
 */
import { dev as isDev } from '$app/environment';
import {
	DEFAULT_IMAGING_SETTINGS,
	IMAGE_FORMATS,
	OUTPUT_FORMATS,
	type ImageFormat,
	type ImagingSettings,
	type OutputFormat
} from '$lib/imaging/core';
import type { Credentials } from './auth';
import { normalizeBaseUrl } from './images';

export interface AppConfig {
	admin: Credentials;
	/** R2 公共访问地址。线上必填；本地开发未设置时为 null，由 /i/ 路由提供文件 */
	r2PublicUrl: string | null;
	/** 是否优先使用 Cloudflare Images 处理 */
	cfImage: boolean;
	imaging: ImagingSettings;
	allowAnonymous: boolean;
	allowVideo: boolean;
	/** R2 路径中日期所用的时区（IANA 名称） */
	timeZone: string;
}

export interface ConfigIssue {
	name: string;
	problem: 'missing' | 'invalid';
	/** 合法取值的说明，不分语言 */
	expected: string;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; issues: ConfigIssue[] };

/** adapter-cloudflare 在 vite dev 下也会模拟 platform */
export function requireEnv(platform: App.Platform | undefined): Env {
	if (!platform) throw new Error('Cloudflare platform 不可用');
	return platform.env;
}

/** 文件链接的前缀 */
export function mediaBase(config: AppConfig, origin: string): string {
	return config.r2PublicUrl ?? `${origin}/i`;
}

const TRUE_VALUES = ['true', '1', 'yes', 'on'];
const FALSE_VALUES = ['false', '0', 'no', 'off'];
const FORMAT_ALIASES: Record<string, ImageFormat> = { jpg: 'jpeg', tif: 'tiff', heif: 'heic' };

/** 解析函数：合法时返回值，不合法时返回 undefined */
type Parser<T> = (raw: string) => T | undefined;

const parseBoolean: Parser<boolean> = (raw) => {
	const value = raw.toLowerCase();
	return TRUE_VALUES.includes(value) ? true : FALSE_VALUES.includes(value) ? false : undefined;
};

const parseInteger =
	(min: number, max = Number.MAX_SAFE_INTEGER): Parser<number> =>
	(raw) => {
		const value = Number(raw);
		return /^\d+$/.test(raw) && value >= min && value <= max ? value : undefined;
	};

const parseImageFormat = (raw: string): ImageFormat | undefined => {
	const value = raw.toLowerCase();
	const format = FORMAT_ALIASES[value] ?? value;
	return IMAGE_FORMATS.includes(format as ImageFormat) ? (format as ImageFormat) : undefined;
};

const parseOutputFormat: Parser<OutputFormat> = (raw) => {
	const format = parseImageFormat(raw);
	return OUTPUT_FORMATS.includes(format as OutputFormat) ? (format as OutputFormat) : undefined;
};

/** IANA 时区名，如 Asia/Shanghai；返回规范写法 */
const parseTimeZone: Parser<string> = (raw) => {
	try {
		return new Intl.DateTimeFormat('en', { timeZone: raw }).resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
};

/** 逗号或空白分隔的格式列表；none 表示空列表 */
const parseFormatList: Parser<ImageFormat[]> = (raw) => {
	if (raw.toLowerCase() === 'none') return [];
	const formats = raw.split(/[\s,]+/).filter(Boolean).map(parseImageFormat);
	return formats.every((f) => f !== undefined) ? [...new Set(formats)] : undefined;
};

export function loadConfig(env: Env, { dev = isDev } = {}): ConfigResult {
	const issues: ConfigIssue[] = [];

	/** 读取并解析一项；空字符串视为未设置 */
	function read<T>(name: keyof Env, parse: Parser<T>, expected: string, fallback?: T): T | undefined {
		const value = env[name];
		const raw = typeof value === 'string' ? value.trim() : value === undefined ? '' : String(value);
		if (raw === '') {
			if (fallback === undefined) issues.push({ name, problem: 'missing', expected });
			return fallback;
		}
		const parsed = parse(raw);
		if (parsed === undefined) issues.push({ name, problem: 'invalid', expected });
		return parsed;
	}
	const text: Parser<string> = (raw) => raw;

	const user = read('ADMIN_USER', text, 'text');
	// 密码不做 trim：首尾空格也算密码的一部分
	const password = env.ADMIN_PASSWORD || undefined;
	if (!password) issues.push({ name: 'ADMIN_PASSWORD', problem: 'missing', expected: 'text' });

	// 本地开发的 R2 是模拟的、没有公共域名，所以只在线上必填
	const r2PublicUrl = read(
		'R2_PUBLIC_URL',
		(raw) => normalizeBaseUrl(raw) ?? undefined,
		'https://…',
		dev ? null : undefined
	);
	const cfImage = read('CF_IMAGE', parseBoolean, 'true | false', true);
	const formatList = `${IMAGE_FORMATS.join(', ')} | none`;
	const convert = read('CONVERT_FORMATS', parseFormatList, formatList, DEFAULT_IMAGING_SETTINGS.convert);
	const convertTo = read('CONVERT_TO', parseOutputFormat, OUTPUT_FORMATS.join(' | '), DEFAULT_IMAGING_SETTINGS.convertTo);
	const quality = read('QUALITY', parseInteger(1, 100), '1–100', DEFAULT_IMAGING_SETTINGS.quality);
	const maxEdge = read('MAX_EDGE', parseInteger(1), '≥ 1', DEFAULT_IMAGING_SETTINGS.maxEdge);
	const allowAnonymous = read('ALLOW_ANONYMOUS', parseBoolean, 'true | false', false);
	const allowVideo = read('ALLOW_VIDEO', parseBoolean, 'true | false', true);
	const timeZone = read('TIMEZONE', parseTimeZone, 'IANA time zone, e.g. Asia/Shanghai', 'UTC');

	if (issues.length > 0) return { ok: false, issues };
	return {
		ok: true,
		config: {
			admin: { user: user!, password: password! },
			r2PublicUrl: r2PublicUrl!,
			cfImage: cfImage!,
			imaging: { convert: convert!, convertTo: convertTo!, quality: quality!, maxEdge: maxEdge! },
			allowAnonymous: allowAnonymous!,
			allowVideo: allowVideo!,
			timeZone: timeZone!
		}
	};
}
