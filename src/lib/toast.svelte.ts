import { createContext } from 'svelte';

export interface Toast {
	id: number;
	text: string;
	kind: 'info' | 'error';
}

/** 屏幕底部的短暂提示，如"已复制" */
export class Toaster {
	items = $state<Toast[]>([]);
	#nextId = 0;

	show(text: string, kind: Toast['kind'] = 'info') {
		const id = this.#nextId++;
		this.items.push({ id, text, kind });
		setTimeout(() => (this.items = this.items.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 2500);
	}
}

export const [getToaster, setToaster] = createContext<Toaster>();
