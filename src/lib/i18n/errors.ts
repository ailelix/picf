import type { MessageKey } from './messages';
import { MESSAGES } from './messages';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** 把接口返回的错误码转成当前语言的提示；没有对应文案时显示原始信息 */
export function errorMessage(t: Translate, error: unknown): string {
	const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
	const key = `error.${code}` as MessageKey;
	if (code && key in MESSAGES.zh) return t(key);
	return t('error.unknown', { message: error instanceof Error ? error.message : String(error) });
}
