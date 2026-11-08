import { Capacitor, registerPlugin } from '@capacitor/core';

const Printer = registerPlugin('Printer');

const withPrintTimeout = (printRequest) => {
	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			Printer.cancelPrint().catch(() => {});
			reject(new Error('Printer operation timed out. Choose the printer again and retry.'));
		}, 60000);

		printRequest.then(
			(result) => {
				window.clearTimeout(timeoutId);
				resolve(result);
			},
			(error) => {
				window.clearTimeout(timeoutId);
				reject(error);
			}
		);
	});
};

export const printReceiptWithNativePrinter = (text) => (
	withPrintTimeout(Printer.printText({ text }))
);

export const printReceiptImageWithNativePrinter = (imageBase64) => (
	withPrintTimeout(Printer.printImage({ imageBase64 }))
);

export const printHtmlWithNativeRaster = async (html) => {
	const parsedHtml = new DOMParser().parseFromString(html, 'text/html');
	const scopeClass = `customer-statement-print-${Date.now()}`;
	const container = document.createElement('div');
	container.className = scopeClass;
	container.setAttribute('aria-hidden', 'true');
	container.style.position = 'fixed';
	container.style.top = '0';
	container.style.left = '-10000px';
	container.style.width = '302px';
	container.style.overflow = 'visible';
	container.style.backgroundColor = '#ffffff';
	container.innerHTML = parsedHtml.body.innerHTML;

	const scopedStyles = Array.from(parsedHtml.querySelectorAll('style'))
		.map((style) => style.textContent || '')
		.join('\n')
		.replace(/@page[^{}]*\{[^}]*\}/gi, '')
		.replace(/([^{}]+)\{([^{}]*)\}/g, (_rule, selectors, declarations) => {
			const scopedSelectors = selectors.split(',').map((selector) => {
				const value = selector.trim();
				if (value === 'html' || value === 'body') return `.${scopeClass}`;
				if (value.startsWith('body ')) return `.${scopeClass} ${value.slice(5)}`;
				return `.${scopeClass} ${value}`;
			});
			return `${scopedSelectors.join(', ')} {${declarations}}`;
		});
	const styleElement = document.createElement('style');
	styleElement.textContent = scopedStyles;
	document.head.appendChild(styleElement);
	document.body.appendChild(container);

	try {
		await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
		const { default: html2canvas } = await import('html2canvas');
		const canvas = await html2canvas(container, {
			backgroundColor: '#ffffff',
			scale: 2,
			useCORS: true,
			logging: false,
			scrollX: 0,
			scrollY: 0,
			windowWidth: container.scrollWidth,
			windowHeight: container.scrollHeight
		});
		const imageBase64 = canvas.toDataURL('image/png').split(',')[1];
		if (!imageBase64) throw new Error('Could not prepare the statement image.');
		return await printReceiptImageWithNativePrinter(imageBase64);
	} finally {
		container.remove();
		styleElement.remove();
	}
};

export const isNativeAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
