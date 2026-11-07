# Frontend

## Android BLE Printing

The web app continues to print through the browser. Every Android print scans for BLE devices and asks the user to select a printer. The app automatically selects a writable GATT characteristic, preferring common Nordic UART and thermal-printer UUIDs; it does not ask the user to choose a characteristic. Direct connection and service discovery are bounded by timeouts, and a 60-second UI watchdog cancels stuck operations.

To sync the web app and open the Android project in Android Studio:

```powershell
npm install
npm run android:sync
npm run android:open
```

An Android SDK and a compatible JDK must be installed. The app needs Android's Nearby devices permission (or location permission on older Android versions) to scan.

Automatic UUID ranking is a best-effort heuristic; the target printer's documented GATT profile remains the source of truth if a write fails. A successful result means Android received successful GATT write callbacks, not that the printer confirmed a physical print. The native path sends plain text and does not include receipt images such as the QR code. Printer-specific service UUIDs, packet sizes, text encoding, and image commands may require adapting the native plugin to the printer's manual.
