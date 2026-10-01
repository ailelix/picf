/** 前后端共用的 HTTP 接口类型 */
import type { ImageFormat, ImagingSettings, Rejection, TransformSpec } from '$lib/imaging/core';
import type { VideoFormat } from '$lib/video';

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
/** Workers 请求体上限 100MB、内存上限 128MB，留出余量 */
export const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

/** 图片管理页每页数量 */
export const IMAGE_PAGE_SIZE = 30;

/**
 * POST /api/images 的 mode 字段：
 * - auto：默认，给 PicGo 等 API 客户端用。先试 CF，失败就原样保存
 * - fallback：浏览器上传。CF 处理不了时返回 422 和 spec，由浏览器用 WASM 处理
 * - processed：浏览器已按 spec 处理过，直接保存
 * - raw：原样保存，不做任何处理
 */
export const UPLOAD_MODES = ['auto', 'fallback', 'processed', 'raw'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

/** 由哪个引擎处理的；none 表示原样保存 */
export type Engine = 'cf' | 'wasm' | 'none';
/** 谁上传的，记在 R2 对象元数据里 */
export type Uploader = 'admin' | 'anonymous';

/** POST /api/images 201 */
export interface UploadedImage {
	id: string;
	key: string;
	url: string;
	createdAt: number;
	kind: 'image' | 'video';
	format: ImageFormat | VideoFormat;
	size: number;
	width?: number;
	height?: number;
	engine: Engine;
}

/** POST /api/images 422：需要浏览器处理 */
export interface ClientProcessingRequired {
	error: 'CLIENT_PROCESSING_REQUIRED';
	spec: TransformSpec;
	reasons: Rejection[];
}

export interface ApiError {
	error: string;
	message?: string;
}

/** 上传页需要的配置，由上传页的服务端 load 提供（开启匿名上传时未登录也能访问） */
export interface ClientConfig {
	cfEnabled: boolean;
	imaging: ImagingSettings;
	allowVideo: boolean;
}

/** GET /api/images 的列表项 */
export interface ListedImage {
	id: string;
	key: string;
	url: string;
	createdAt: number;
}

/** GET /api/images */
export interface ImageList {
	items: ListedImage[];
	/** 下一页的游标，没有更多时为 null */
	cursor: string | null;
}
