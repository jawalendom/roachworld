import { fontsReady, onFontsChanged } from './fonts';
import { renderMasthead } from './masthead';
import { sizeCanvas } from './render';

export function mountMasthead(canvas: HTMLCanvasElement) {
	const text = canvas.dataset.text || 'ROACHWORLD';
	const subtitle = canvas.dataset.subtitle || undefined;
	const ratio = Number(canvas.dataset.ratio || '0.3');

	let raf = 0;
	const draw = async () => {
		await fontsReady();
		const parent = canvas.parentElement!;
		const w = parent.clientWidth;
		const h = Math.max(120, Math.round(w * ratio));
		const ctx = sizeCanvas(canvas, w, h);
		renderMasthead(ctx, { text, subtitle, width: w, height: h });
		canvas.dataset.painted = '';
	};
	const schedule = () => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(draw);
	};

	schedule();
	const ro = new ResizeObserver(schedule);
	ro.observe(canvas.parentElement!);
	onFontsChanged(schedule);
}
