/** 允许上传的视频格式。视频不做任何处理，原样保存 */
export const VIDEO_FORMATS = ['mp4', 'webm', 'mov'] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const VIDEO_MIME_TYPES: Record<VideoFormat, string> = {
	mp4: 'video/mp4',
	webm: 'video/webm',
	mov: 'video/quicktime'
};

const MP4_BRANDS = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'mmp4'];
/** 没有 ftyp 的老式 QuickTime 文件以这些 atom 开头 */
const LEGACY_MOV_ATOMS = ['moov', 'mdat', 'wide'];

/**
 * 从文件开头识别视频格式，只需要前几十个字节。
 * 应在图片识别之后调用：HEIC/AVIF 同样以 ftyp 开头。
 */
export function sniffVideo(bytes: Uint8Array): VideoFormat | null {
	const ascii = (offset: number, length: number) =>
		String.fromCharCode(...bytes.subarray(offset, offset + length));

	if (ascii(4, 4) === 'ftyp') {
		const major = ascii(8, 4);
		if (major === 'qt  ') return 'mov';
		if (MP4_BRANDS.includes(major)) return 'mp4';
		return null;
	}
	if (LEGACY_MOV_ATOMS.includes(ascii(4, 4))) return 'mov';
	if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
		// EBML 头里的 DocType 区分 WebM 和 Matroska；浏览器对 Matroska 支持很差，不接受
		return ebmlDocType(bytes) === 'webm' ? 'webm' : null;
	}
	return null;
}

/** 在 EBML 头里找 DocType（ID 0x4282），长度是 1 字节的 vint */
function ebmlDocType(bytes: Uint8Array): string | null {
	const end = Math.min(bytes.length, 64);
	for (let i = 4; i + 3 < end; i++) {
		if (bytes[i] !== 0x42 || bytes[i + 1] !== 0x82 || !(bytes[i + 2] & 0x80)) continue;
		const length = bytes[i + 2] & 0x7f;
		return String.fromCharCode(...bytes.subarray(i + 3, i + 3 + length));
	}
	return null;
}
