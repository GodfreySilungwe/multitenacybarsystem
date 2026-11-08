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
	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	iframe.style.position = 'fixed';
	iframe.style.top = '0';
	iframe.style.left = '-10000px';
	iframe.style.width = '302px';
	iframe.style.height = '1px';
	iframe.style.border = '0';

	const loaded = new Promise((resolve, reject) => {
		iframe.onload = resolve;
		iframe.onerror = () => reject(new Error('Could not render the statement for printing.'));
	});
	document.body.appendChild(iframe);

	try {
		iframe.srcdoc = html;
		await loaded;
		const receiptDocument = iframe.contentDocument;
		if (!receiptDocument?.body) throw new Error('Could not render the statement for printing.');
		await new Promise((resolve) => iframe.contentWindow.requestAnimationFrame(() => resolve()));

		const { default: html2canvas } = await import('html2canvas');
		const canvas = await html2canvas(receiptDocument.body, {
			backgroundColor: '#ffffff',
			scale: 2,
			useCORS: true,
			logging: false
		});
		const imageBase64 = canvas.toDataURL('image/png').split(',')[1];
		if (!imageBase64) throw new Error('Could not prepare the statement image.');
		return await printReceiptImageWithNativePrinter(imageBase64);
	} finally {
		iframe.remove();
	}
};

export const isNativeAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
