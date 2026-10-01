/** 图床接受的输入格式 */
export const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'bmp', 'ico', 'heic', 'svg'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** 可选的转换目标格式，都是浏览器能直接显示的 */
export const OUTPUT_FORMATS = ['webp', 'avif', 'jpeg', 'png'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const MIME_TYPES: Record<ImageFormat, string> = {
	png: 'image/png',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	avif: 'image/avif',
	gif: 'image/gif',
	tiff: 'image/tiff',
	bmp: 'image/bmp',
	ico: 'image/x-icon',
	heic: 'image/heic',
	svg: 'image/svg+xml'
};

export const EXTENSIONS: Record<ImageFormat, string> = {
	png: 'png',
	jpeg: 'jpg',
	webp: 'webp',
	avif: 'avif',
	gif: 'gif',
	tiff: 'tif',
	bmp: 'bmp',
	ico: 'ico',
	heic: 'heic',
	svg: 'svg'
};

export interface ImageInfo {
	format: ImageFormat;
	/** 整个文件的字节数 */
	size: number;
	/** 只解析 PNG、JPEG、GIF、WebP、BMP；其他格式或文件被截断时为 undefined */
	width?: number;
	height?: number;
}

/** 识别 SVG 时最多检查开头这么多字节 */
const SNIFF_BYTES = 4096;

/**
 * 读取图片的格式和宽高，只解析文件头，不解码像素。
 * 不认识的格式返回 null；`size` 默认取 bytes 的长度，只传了文件开头时应传入真实大小。
 */
export function probe(bytes: Uint8Array, size = bytes.length): ImageInfo | null {
	const format = sniffFormat(bytes);
	if (!format) return null;

	let details: Partial<ImageInfo> = {};
	try {
		details = readDetails(new Reader(bytes), format);
	} catch {
		// 文件被截断或结构损坏：格式已确定，其余信息留空
	}
	const { width, height } = details;
	const valid = (width ?? 0) > 0 && (height ?? 0) > 0;
	return { format, size, ...(valid && { width, height }) };
}

function sniffFormat(bytes: Uint8Array): ImageFormat | null {
	const r = new Reader(bytes);
	if (r.startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (r.startsWith([0xff, 0xd8, 0xff])) return 'jpeg';
	const head = r.ascii(0, 12);
	if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'gif';
	if (head.startsWith('RIFF') && head.slice(8) === 'WEBP') return 'webp';
	// 标准 TIFF 的魔数是 42，BigTIFF 是 43
	if (/^(II[*+]\0|MM\0[*+])/.test(head)) return 'tiff';
	if (isBmp(r)) return 'bmp';
	if (isIco(r)) return 'ico';
	const heif = heifFormat(r);
	if (heif) return heif;
	if (isSvg(bytes)) return 'svg';
	return null;
}

function readDetails(r: Reader, format: ImageFormat): Partial<ImageInfo> {
	switch (format) {
		case 'png':
			return { width: r.u32be(16), height: r.u32be(20) };
		case 'jpeg':
			return readJpeg(r);
		case 'gif':
			return { width: r.u16le(6), height: r.u16le(8) };
		case 'webp':
			return readWebp(r);
		case 'bmp':
			return readBmp(r);
		default:
			return {};
	}
}

// ---- 各格式解析 ----

function readJpeg(r: Reader): Partial<ImageInfo> {
	for (let p = 2; p + 4 <= r.length; ) {
		if (r.u8(p) !== 0xff) return {};
		const marker = r.u8(p + 1);
		if (marker === 0xff) {
			p++; // 填充字节
			continue;
		}
		// 没有长度字段的独立标记：TEM、RST0-7、SOI、EOI
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
			p += 2;
			continue;
		}
		// SOF0-15，排除同段编号里的 DHT(C4)、JPG(C8)、DAC(CC)
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return { height: r.u16be(p + 5), width: r.u16be(p + 7) };
		}
		p += 2 + r.u16be(p + 2);
	}
	return {};
}

function readWebp(r: Reader): Partial<ImageInfo> {
	switch (r.ascii(12, 4)) {
		case 'VP8 ':
			return { width: r.u16le(26) & 0x3fff, height: r.u16le(28) & 0x3fff };
		case 'VP8L': {
			const bits = r.u32le(21);
			return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
		}
		case 'VP8X':
			return { width: r.u24le(24) + 1, height: r.u24le(27) + 1 };
		default:
			return {};
	}
}

const BMP_DIB_SIZES = [12, 40, 52, 56, 64, 108, 124];

function isBmp(r: Reader): boolean {
	return r.length >= 26 && r.ascii(0, 2) === 'BM' && BMP_DIB_SIZES.includes(r.u32le(14));
}

function readBmp(r: Reader): Partial<ImageInfo> {
	if (r.u32le(14) === 12) return { width: r.u16le(18), height: r.u16le(20) };
	// 高度为负表示自上而下存储
	return { width: r.i32le(18), height: Math.abs(r.i32le(22)) };
}

function isIco(r: Reader): boolean {
	// ICO 没有专门的魔数，只能靠文件头 + 第一个目录项的保留字段来判断
	return (
		r.length >= 22 &&
		r.u16le(0) === 0 &&
		r.u16le(2) === 1 &&
		r.u16le(4) > 0 &&
		r.u8(9) === 0 &&
		r.u16le(10) <= 1
	);
}

// ---- HEIF 容器（HEIC / AVIF）----

const AVIF_BRANDS = ['avif', 'avis'];
const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'];

function heifBrands(r: Reader): string[] | null {
	if (r.length < 16 || r.ascii(4, 4) !== 'ftyp') return null;
	const end = Math.min(r.u32be(0), r.length);
	const brands = [r.ascii(8, 4)];
	for (let p = 16; p + 4 <= end; p += 4) brands.push(r.ascii(p, 4));
	return brands;
}

function heifFormat(r: Reader): 'avif' | 'heic' | null {
	const brands = heifBrands(r);
	if (!brands) return null;
	// AVIF 文件的兼容品牌里通常也有 mif1，所以先判断 AVIF
	if (brands.some((b) => AVIF_BRANDS.includes(b))) return 'avif';
	if (brands.some((b) => HEIC_BRANDS.includes(b))) return 'heic';
	return null;
}

// ---- SVG ----

const SVG_PATTERN =
	/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)\s*)*<svg[\s>/]/i;

function isSvg(bytes: Uint8Array): boolean {
	// TextDecoder 默认会去掉开头的 BOM
	return SVG_PATTERN.test(new TextDecoder().decode(bytes.subarray(0, SNIFF_BYTES)));
}

// ---- 字节读取 ----

/** 越界读取会抛 RangeError，由 probe 统一捕获 */
class Reader {
	private view: DataView;

	constructor(private bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	get length() {
		return this.bytes.length;
	}

	startsWith(signature: number[]) {
		return signature.every((b, i) => this.bytes[i] === b);
	}

	/** 越界部分截断，不抛错，方便用于格式识别 */
	ascii(offset: number, length: number) {
		return String.fromCharCode(...this.bytes.subarray(offset, offset + length));
	}

	u8 = (p: number) => this.view.getUint8(p);
	u16le = (p: number) => this.view.getUint16(p, true);
	u16be = (p: number) => this.view.getUint16(p, false);
	u24le = (p: number) => this.view.getUint16(p, true) | (this.view.getUint8(p + 2) << 16);
	u32le = (p: number) => this.view.getUint32(p, true);
	u32be = (p: number) => this.view.getUint32(p, false);
	i32le = (p: number) => this.view.getInt32(p, true);
}
