const zh = {
	'app.name': 'picf',

	'nav.upload': '上传',
	'nav.images': '图片',
	'nav.login': '登录',
	'nav.logout': '退出登录',

	'theme.auto': '主题：跟随系统',
	'theme.light': '主题：浅色',
	'theme.dark': '主题：深色',
	'locale.switch': 'Switch to English',

	'login.title': '登录',
	'login.user': '用户名',
	'login.password': '密码',
	'login.submit': '登录',
	'login.invalid': '用户名或密码错误',

	'upload.title': '上传',
	'upload.drop': '拖放文件到这里，或点击选择（可多选）',
	'upload.paste': '也可以直接粘贴图片',
	'upload.hintImages': '支持 PNG、JPG、WebP、AVIF、GIF、TIFF、BMP、ICO、HEIC、SVG',
	'upload.hintVideos': '，以及 MP4、WebM、MOV 视频',
	'upload.start': '开始上传（{count}）',
	'upload.clear': '清除已完成',
	'upload.remove': '移除',
	'upload.status.pending': '待上传',
	'upload.status.queued': '排队中',
	'upload.status.processing': '处理中',
	'upload.status.uploading': '上传中',
	'upload.status.done': '完成',
	'upload.status.error': '失败',
	'upload.engine.cf': 'Cloudflare 处理',
	'upload.engine.wasm': '本地处理',
	'upload.engine.none': '原样保存',

	'copy.url': '链接',
	'copy.markdown': 'Markdown',
	'copy.html': 'HTML',
	'copy.done': '已复制',
	'copy.failed': '复制失败',

	'images.title': '图片',
	'images.empty': '还没有上传过文件',
	'images.loadMore': '加载更多',
	'images.open': '打开',
	'images.copy': '复制链接',
	'images.delete': '删除',
	'images.confirmDelete': '确认删除？',
	'images.deleted': '已删除',


	'setup.title': 'picf 尚未完成配置',
	'setup.intro': '以下环境变量需要在 Cloudflare 控制台中为 Worker 设置，修改后刷新页面。各项说明见 README。',
	'setup.missing': '未设置',
	'setup.invalid': '值无效，应为 {expected}',

	'error.UNAUTHORIZED': '未登录或登录已过期',
	'error.UNSUPPORTED_FORMAT': '不支持的文件格式',
	'error.VIDEO_DISABLED': '未开启视频上传',
	'error.TOO_LARGE': '文件过大',
	'error.CSRF': '请求被拒绝',
	'error.NOT_FOUND': '文件不存在',
	'error.unknown': '出错了：{message}'
};

export type MessageKey = keyof typeof zh;
export type Messages = Record<MessageKey, string>;

const en: Messages = {
	'app.name': 'picf',

	'nav.upload': 'Upload',
	'nav.images': 'Images',
	'nav.login': 'Log in',
	'nav.logout': 'Log out',

	'theme.auto': 'Theme: system',
	'theme.light': 'Theme: light',
	'theme.dark': 'Theme: dark',
	'locale.switch': '切换到中文',

	'login.title': 'Log in',
	'login.user': 'Username',
	'login.password': 'Password',
	'login.submit': 'Log in',
	'login.invalid': 'Incorrect username or password',

	'upload.title': 'Upload',
	'upload.drop': 'Drop files here, or click to choose (multiple allowed)',
	'upload.paste': 'You can also paste images',
	'upload.hintImages': 'PNG, JPG, WebP, AVIF, GIF, TIFF, BMP, ICO, HEIC and SVG',
	'upload.hintVideos': ', plus MP4, WebM and MOV videos',
	'upload.start': 'Upload ({count})',
	'upload.clear': 'Clear finished',
	'upload.remove': 'Remove',
	'upload.status.pending': 'Ready',
	'upload.status.queued': 'Queued',
	'upload.status.processing': 'Processing',
	'upload.status.uploading': 'Uploading',
	'upload.status.done': 'Done',
	'upload.status.error': 'Failed',
	'upload.engine.cf': 'Processed by Cloudflare',
	'upload.engine.wasm': 'Processed locally',
	'upload.engine.none': 'Stored as is',

	'copy.url': 'URL',
	'copy.markdown': 'Markdown',
	'copy.html': 'HTML',
	'copy.done': 'Copied',
	'copy.failed': 'Copy failed',

	'images.title': 'Images',
	'images.empty': 'Nothing uploaded yet',
	'images.loadMore': 'Load more',
	'images.open': 'Open',
	'images.copy': 'Copy URL',
	'images.delete': 'Delete',
	'images.confirmDelete': 'Delete?',
	'images.deleted': 'Deleted',


	'setup.title': 'picf is not fully configured',
	'setup.intro': 'Set the following environment variables for the Worker in the Cloudflare dashboard, then reload this page. See the README for details.',
	'setup.missing': 'not set',
	'setup.invalid': 'invalid value, expected {expected}',

	'error.UNAUTHORIZED': 'Not logged in, or the session has expired',
	'error.UNSUPPORTED_FORMAT': 'Unsupported file format',
	'error.VIDEO_DISABLED': 'Video uploads are disabled',
	'error.TOO_LARGE': 'File is too large',
	'error.CSRF': 'Request rejected',
	'error.NOT_FOUND': 'File not found',
	'error.unknown': 'Something went wrong: {message}'
};

export const MESSAGES = { zh, en } satisfies Record<string, Messages>;
