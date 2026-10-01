import { describe, expect, it } from 'vitest';
import { targetSize } from './spec';

describe('targetSize', () => {
	const src = { width: 4000, height: 3000 };

	it('源图尺寸未知时返回 null', () => {
		expect(targetSize({}, { width: 100 })).toBeNull();
	});

	it('没有指定宽高时保持原尺寸', () => {
		expect(targetSize(src, {})).toEqual(src);
	});

	it('按最长边等比缩小', () => {
		expect(targetSize(src, { width: 1200, height: 1200 })).toEqual({ width: 1200, height: 900 });
		expect(targetSize({ width: 3000, height: 4000 }, { width: 1200, height: 1200 })).toEqual({
			width: 900,
			height: 1200
		});
	});

	it('只指定一边时按该边缩放', () => {
		expect(targetSize(src, { width: 400 })).toEqual({ width: 400, height: 300 });
		expect(targetSize(src, { height: 600 })).toEqual({ width: 800, height: 600 });
	});

	it('只缩小不放大', () => {
		const small = { width: 100, height: 50 };
		expect(targetSize(small, { width: 1000 })).toEqual(small);
	});

	it('极端比例下边长至少为 1', () => {
		expect(targetSize({ width: 10000, height: 1 }, { width: 100 })).toEqual({ width: 100, height: 1 });
	});
});
