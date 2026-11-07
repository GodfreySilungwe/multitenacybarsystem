import { Capacitor, registerPlugin } from '@capacitor/core';

const Printer = registerPlugin('Printer');

export const printReceiptWithNativePrinter = (text) => {
	const printRequest = Printer.printText({ text });

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

export const isNativeAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
