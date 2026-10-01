# picf

picf 是一个运行在 Cloudflare Workers 上的单用户图床。项目基于 SvelteKit 构建，文件存储在 Cloudflare R2，图片记录存储在 Cloudflare D1。部署只需要一个 Cloudflare 账号，无需自备服务器。

系统只有一个管理员账号，用户名和密码通过环境变量配置，不提供注册功能。

## 功能

- **图片上传**：支持 PNG、JPG、WebP、AVIF、GIF、TIFF、BMP、ICO、HEIC、SVG，单个文件上限 50MB。
- **视频上传**：默认开启，可通过环境变量关闭。支持 MP4、WebM、MOV，文件原样保存，单个文件上限 90MB。
- **格式转换**：上传时自动将指定格式的图片转换为统一的目标格式（WebP、AVIF、JPEG 或 PNG），并可设置压缩质量和最长边上限。转换后的图片总会去除 EXIF 等元数据（含 GPS 位置）；不转换的格式原样保存，保留原有元数据。
- **图片管理**：登录后可浏览已上传的文件，复制链接（URL、Markdown、HTML 三种格式）或删除文件。
- **匿名上传**：可通过环境变量开启。开启后，未登录的访客可以在首页上传文件，但无法查看文件列表或删除文件。
- **API 上传**：支持通过 HTTP 接口上传，可配合 PicGo、ShareX 等工具使用。
- **界面**：支持中文和英文、浅色和深色主题。默认跟随浏览器语言和系统主题，也可以手动切换。

### 图片处理流程

picf 使用两种方式处理图片，按以下顺序选择：

1. 优先由 Cloudflare Images 在服务端转换。
2. 当 Cloudflare Images 无法处理时，由浏览器使用 WASM（wasm-vips）在本地转换后再上传。无法处理的情况包括：输入格式不受支持（Cloudflare Images 不接受 TIFF、BMP、ICO 和 AVIF 作为输入）、图片尺寸或体积超出限制、当月免费额度已用完。
3. 通过 API 上传时没有浏览器参与，若 Cloudflare Images 处理失败，文件将原样保存。

Cloudflare Images 免费版每月提供 5000 次转换。额度用完后不会产生费用：网页上传改由浏览器处理，API 上传原样保存。

## 部署

### 一键部署

点击下方按钮，按页面提示完成部署：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/OWNER/picf)

部署流程如下：

1. 登录 Cloudflare 账号，并授权访问 GitHub 或 GitLab。Cloudflare 会将本项目复制到该账号下，作为一个新的代码仓库。
2. 在配置页面填写管理员用户名 `ADMIN_USER` 和密码 `ADMIN_PASSWORD`。Worker 名称、R2 存储桶和 D1 数据库的名称可以保持默认值。
3. 确认后，Cloudflare 会自动创建 R2 存储桶和 D1 数据库，初始化数据表，然后构建并部署项目。

部署完成后，还需要按下一节配置 R2 的公共访问，站点才能正常使用。在此之前，访问站点会显示配置提示。

此后，向新创建的仓库推送代码时，Cloudflare 会自动重新构建和部署，数据库结构的更新也会在部署时自动应用。

如果控制台提示 Images 服务未开通，请在「Images」页面开通。如果不使用 Cloudflare Images，可以添加环境变量 `CF_IMAGE`，值设为 `false`，此时所有图片都由浏览器处理。

### 配置 R2 公共访问

上传的文件由 R2 存储桶的公共域名直接对外提供，不经过 Worker。因此，部署后需要为存储桶开启公共访问，并将访问地址配置到环境变量 `R2_PUBLIC_URL` 中。

1. 打开 R2 存储桶（默认名称为 `picf-images`）的「设置（Settings）」，在「自定义域（Custom Domains）」中绑定一个域名，例如 `img.example.com`。

   也可以启用「公共开发 URL（Public Development URL）」，使用 Cloudflare 分配的 `r2.dev` 域名。该域名有访问频率限制，仅适合测试，不建议用于生产环境。

2. 在同一页面的「CORS 策略（CORS Policy）」中添加以下规则：

   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   picf 的页面启用了跨域隔离（浏览器端 WASM 处理需要），如果图片所在域名不返回 CORS 响应头，浏览器将拒绝在管理页面中加载这些图片。

3. 在 Worker 的「设置 → 变量和机密（Settings → Variables and Secrets）」中添加环境变量 `R2_PUBLIC_URL`，类型选择「文本（Text）」，值为第 1 步中的访问地址，例如 `https://img.example.com`。

完成后刷新站点，使用管理员账号登录即可开始使用。如需调整转换规则、开启匿名上传或关闭视频上传，参见「环境变量」。

### 更新版本

一键部署创建的是一个独立的仓库，不会自动同步本项目的后续更新。如需更新，将本项目的改动合并到该仓库并推送，Cloudflare 会自动部署新版本。

### 建议：配置限流规则

picf 本身不限制请求频率。建议在控制台的「安全 → WAF → 限流规则（Security → WAF → Rate limiting rules）」中，为 `/login` 和 `POST /api/images` 配置限流规则，以防止密码暴力破解和上传接口被滥用。开启匿名上传前应完成此项配置。

WAF 规则仅适用于自定义域名。如果 Worker 当前使用 `workers.dev` 地址，需要先在 Worker 的「设置 → 域和路由（Settings → Domains & Routes）」中绑定自定义域名。

## 环境变量

picf 的所有配置都通过环境变量设置。`ADMIN_USER` 和 `ADMIN_PASSWORD` 在一键部署时填写；其余变量在 Worker 的「设置 → 变量和机密（Settings → Variables and Secrets）」中添加或修改，保存后立即生效。

环境变量按以下规则校验：

- 必填项未设置或值无效时，站点只显示配置提示，并列出需要修改的变量及其合法取值。
- 选填项未设置或值为空时，使用默认值；值无效时，同样显示配置提示。
- 不认识的变量会被忽略。

### 必填

| 名称 | 类型 | 说明 |
|---|---|---|
| `ADMIN_USER` | 密钥 | 管理员用户名。 |
| `ADMIN_PASSWORD` | 密钥 | 管理员密码。修改后，所有已登录的会话将失效。 |
| `R2_PUBLIC_URL` | 文本 | R2 存储桶的公共访问地址，例如 `https://img.example.com`，文件链接将指向该地址。配置方法参见「配置 R2 公共访问」。 |

### 选填

| 名称 | 默认值 | 说明 |
|---|---|---|
| `CF_IMAGE` | `true` | 是否优先使用 Cloudflare Images 处理图片。设为 `false` 时，所有图片都由浏览器处理。 |
| `CONVERT_FORMATS` | `jpeg,png,bmp,tiff,heic` | 上传时需要转换的格式，以逗号分隔。可选值为 `png`、`jpeg`、`webp`、`avif`、`gif`、`tiff`、`bmp`、`ico`、`heic`、`svg`，也接受 `jpg`、`tif`、`heif`。设为 `none` 时不转换任何格式。未列出的格式原样保存。 |
| `CONVERT_TO` | `webp` | 转换的目标格式，可选值为 `webp`、`avif`、`jpeg`、`png`。 |
| `QUALITY` | `80` | 压缩质量，取值为 1–100 的整数，对 WebP、AVIF、JPEG 有效。 |
| `MAX_EDGE` | 不限制 | 转换时的最长边上限（像素），超过时等比缩小。 |
| `ALLOW_ANONYMOUS` | `false` | 是否允许匿名上传。开启后，未登录的访客可以在首页上传文件，但无法查看文件列表或删除文件。 |
| `ALLOW_VIDEO` | `true` | 是否允许上传视频（MP4、WebM、MOV，原样保存）。 |
| `TIMEZONE` | `UTC` | 文件在 R2 中按「年/月/日」分目录存放，例如 `2026/09/29/aB3xK9mQ2zLp.webp`。此项指定计算日期所用的时区，取值为 IANA 时区名，例如 `Asia/Shanghai`。 |

布尔值可以写作 `true`/`false`、`1`/`0`、`yes`/`no` 或 `on`/`off`，不区分大小写。

## API

### 上传文件

```
POST /api/images
```

请求体为 `multipart/form-data`，文件放在 `file` 字段中。接口使用 HTTP Basic Auth 认证，凭证为管理员的用户名和密码。

示例：

```sh
curl -u 用户名:密码 -F file=@photo.jpg https://example.com/api/images
```

上传成功时返回 `201`，响应体为 JSON，其中 `url` 字段为文件地址：

```json
{
  "id": "…",
  "url": "https://img.example.com/2026/09/29/xxxx.webp",
  "format": "webp",
  "size": 12345
}
```

开启匿名上传后，请求可以不携带 `Authorization` 请求头。如果携带了凭证但凭证错误，接口返回 `401`，不会作为匿名上传处理，以免客户端的凭证配置错误未被发现。

### 配置第三方工具

PicGo（需安装 web-uploader 插件）、ShareX 等工具可按下表配置自定义上传：

| 配置项 | 值 |
|---|---|
| 上传地址 | `https://example.com/api/images`，请求方法为 POST |
| 文件字段名 | `file` |
| 请求头 | `Authorization: Basic <“用户名:密码”的 Base64 编码>` |
| 返回地址 | 响应 JSON 中的 `url` 字段 |

## 本地开发

本地开发无需连接 Cloudflare，R2 和 D1 由 wrangler 在本地模拟。

```sh
npm install
cp .env.example .env
npx wrangler d1 migrations apply picf-db --local
npm run dev
```

`.env` 用于配置本地开发时的环境变量，包括管理员账号和密码，以及可选的 `CF_IMAGE`。该文件已被 Git 忽略。

本地的 R2 由 wrangler 模拟，没有公共域名，因此本地开发时无需设置 `R2_PUBLIC_URL`，文件由本地的 `/i/` 路由提供。该路由仅在开发模式下可用。

本地模拟的数据保存在 `.wrangler/state` 目录中。删除该目录即可清空数据，之后需要重新执行迁移命令。

本地的 Cloudflare Images 为简化模拟，仅支持缩放和格式转换。HEIC 转换等功能需要部署后验证。

### 修改数据库结构

在 `migrations/` 目录下新建迁移文件（例如 `0003_xxx.sql`），然后在本地执行迁移：

```sh
npx wrangler d1 migrations apply picf-db --local
```

线上数据库会在下次部署时自动执行新的迁移。

### 目录结构

```
src/lib/imaging/   图片处理模块：格式识别、处理策略、Cloudflare Images、浏览器端 WASM
src/lib/server/    服务端逻辑：认证、环境变量解析、文件存储、上传
src/lib/client/    浏览器端上传流程
src/lib/i18n/      中英文文案
src/routes/        页面和接口
migrations/        D1 数据库迁移文件
```

`src/lib/imaging/` 是独立的图片处理模块，不依赖 SvelteKit，负责判断图片由哪种方式处理以及如何处理。

Worker 的绑定和环境变量的类型定义在 `src/app.d.ts` 中手动维护。修改 `wrangler.jsonc` 中的绑定或新增环境变量时，需要同步更新该文件。

## 已知限制

- **跨域隔离**：浏览器端 WASM 处理依赖 SharedArrayBuffer，浏览器仅在页面启用跨域隔离时才允许使用该 API。因此，picf 的所有页面都会返回 COOP 和 COEP 响应头（配置位于 `src/hooks.server.ts` 和项目根目录的 `_headers` 文件）。如需在页面中引用其他域名的资源，对方必须返回 CORS 或 `Cross-Origin-Resource-Policy` 响应头，否则浏览器将拦截该资源。
- **HEIC**：浏览器端不处理 HEIC，HEIC 文件只能由 Cloudflare Images 转换；若 Cloudflare Images 无法处理或未启用，文件将原样保存。
- **SVG**：SVG 可能包含脚本，因此在浏览器中直接打开 SVG 链接时会下载文件而不是显示，通过 `<img>` 引用不受影响。
- **删除与缓存**：文件链接设置了长期缓存。删除文件后，已被 CDN 或浏览器缓存的副本可能仍可访问一段时间。
- **视频大小**：受 Workers 请求体（100MB）和内存（128MB）限制，视频上限为 90MB。
