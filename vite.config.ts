import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

// wasm-vips 需要跨域隔离（SharedArrayBuffer）；生产环境见 src/hooks.server.ts 和 _headers
const isolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	server: { headers: isolationHeaders },
	preview: { headers: isolationHeaders },
	// wasm-vips 用 new URL('vips-es6.js', import.meta.url) 启动线程，预打包会破坏这个路径
	optimizeDeps: { exclude: ['wasm-vips'] },
	worker: { format: 'es' }
});
