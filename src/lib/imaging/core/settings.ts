import type { ImageFormat, OutputFormat } from './formats';

export interface ImagingSettings {
	/** 需要转换的输入格式；其他格式原样保存 */
	convert: ImageFormat[];
	/** 统一的目标格式 */
	convertTo: OutputFormat;
	/** 1-100 */
	quality: number;
	/** 转换时的最长边上限，只缩小不放大；null 表示不限制 */
	maxEdge: number | null;
}

export const DEFAULT_IMAGING_SETTINGS: ImagingSettings = {
	convert: ['jpeg', 'png', 'bmp', 'tiff', 'heic'],
	convertTo: 'webp',
	quality: 80,
	maxEdge: null
};
