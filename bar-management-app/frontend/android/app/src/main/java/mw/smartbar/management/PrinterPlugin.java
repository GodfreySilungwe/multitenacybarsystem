package mw.smartbar.management;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(
    name = "Printer",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }
        ),
        @Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION }
        )
    }
)
public class PrinterPlugin extends Plugin {
    private static final long SCAN_TIMEOUT_MS = 15000;
    private static final long CONNECTION_TIMEOUT_MS = 12000;
    private static final long MTU_TIMEOUT_MS = 4000;
    private static final long SERVICE_DISCOVERY_TIMEOUT_MS = 12000;
    private static final long WRITE_TIMEOUT_MS = 8000;
    private static final long NO_RESPONSE_WRITE_INTERVAL_MS = 20;
    private static final long PRINTER_DRAIN_DELAY_MS = 750;
    private static final int DEFAULT_BLE_PAYLOAD_SIZE = 20;
    private static final int MAX_BLE_PAYLOAD_SIZE = 182;
    private static final int REQUESTED_MTU = MAX_BLE_PAYLOAD_SIZE + 3;
    private static final int MAX_IMAGE_BASE64_LENGTH = 12 * 1024 * 1024;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, BleCandidate> discoveredDevices = new LinkedHashMap<>();
    private PluginCall activeCall;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeCharacteristic;
    private int blePayloadSize = DEFAULT_BLE_PAYLOAD_SIZE;
    private boolean writeWithResponse;
    private boolean serviceDiscoveryStarted;
    private byte[] printData;
    private int printOffset;
    private int pendingChunkLength;
    private Runnable scanTimeout;
    private Runnable connectionTimeout;
    private Runnable mtuTimeout;
    private Runnable serviceDiscoveryTimeout;
    private Runnable writeTimeout;
    private boolean drainScheduled;

    @PluginMethod
    public void printText(PluginCall call) {
        requestPrintPermissionOrStart(call);
    }

    @PluginMethod
    public void printImage(PluginCall call) {
        String imageBase64 = call.getString("imageBase64", "");
        if (imageBase64.isEmpty() || imageBase64.length() > MAX_IMAGE_BASE64_LENGTH) {
            call.reject("Receipt image is empty or too large.");
            return;
        }
        requestPrintPermissionOrStart(call);
    }

    private void requestPrintPermissionOrStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            requestPermissionForAlias("bluetooth", call, "permissionResult");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "permissionResult");
            return;
        }
        startPrint(call);
    }

    @PluginMethod
    public void cancelPrint(PluginCall call) {
        if (activeCall != null) {
            finishPrint("Printing cancelled.", false);
        }
        call.resolve();
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? getPermissionState("bluetooth") == PermissionState.GRANTED
            : getPermissionState("location") == PermissionState.GRANTED;
        if (!granted) {
            call.reject("Bluetooth permission is required to find and print to a BLE printer.");
            return;
        }
        startPrint(call);
    }

    private void startPrint(PluginCall call) {
        String text = call.getString("text", "");
        String imageBase64 = call.getString("imageBase64", "");
        boolean imagePrint = !imageBase64.isEmpty();
        if (!imagePrint && text.trim().isEmpty()) {
            call.reject("Receipt text is empty.");
            return;
        }
        if (imagePrint && (imageBase64.isEmpty() || imageBase64.length() > MAX_IMAGE_BASE64_LENGTH)) {
            call.reject("Receipt image is empty or too large.");
            return;
        }
        if (activeCall != null) {
            call.reject("A printer operation is already in progress.");
            return;
        }

        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) {
            call.reject("Bluetooth is not available on this device.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Turn on Bluetooth, then try printing again.");
            return;
        }

        try {
            printData = imagePrint ? encodeImage(imageBase64) : encodeText(text);
        } catch (IllegalArgumentException | IllegalStateException error) {
            call.reject(error.getMessage());
            return;
        }

        printOffset = 0;
        pendingChunkLength = 0;
        blePayloadSize = DEFAULT_BLE_PAYLOAD_SIZE;
        writeWithResponse = false;
        serviceDiscoveryStarted = false;
        drainScheduled = false;
        activeCall = call;
        startBleScan(adapter);
    }

    private byte[] encodeText(String text) {
        byte[] receipt = text.getBytes(StandardCharsets.UTF_8);
        byte[] payload = new byte[receipt.length + 5];
        payload[0] = 0x1B;
        payload[1] = 0x40;
        System.arraycopy(receipt, 0, payload, 2, receipt.length);
        payload[receipt.length + 2] = 0x0A;
        payload[receipt.length + 3] = 0x0A;
        payload[receipt.length + 4] = 0x0A;
        return payload;
    }

    private byte[] encodeImage(String imageBase64) {
        byte[] pngBytes;
        try {
            pngBytes = Base64.decode(imageBase64, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Could not decode the receipt image.");
        }

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.length, bounds);
        long sourcePixels = (long) bounds.outWidth * bounds.outHeight;
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 4096
            || bounds.outHeight > 24000 || sourcePixels > 24000000) {
            throw new IllegalArgumentException("Receipt image dimensions are invalid or too large.");
        }

        Bitmap bitmap = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.length);
        if (bitmap == null) {
            throw new IllegalArgumentException("Could not decode the receipt image.");
        }
        try {
            return EscPosRaster.encode(bitmap);
        } finally {
            bitmap.recycle();
        }
    }

    private void startBleScan(BluetoothAdapter adapter) {
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            finishPrint("BLE scanning is unavailable. Check that Bluetooth is turned on.", false);
            return;
        }
        discoveredDevices.clear();
        try {
            scanner.startScan(null, new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build(), scanCallback);
            scanTimeout = () -> showDeviceChooser();
            mainHandler.postDelayed(scanTimeout, SCAN_TIMEOUT_MS);
        } catch (SecurityException error) {
            finishPrint("Bluetooth scan permission is missing. Allow Nearby devices and try again.", false);
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            mainHandler.post(() -> {
                if (activeCall == null) return;
                BluetoothDevice device = result.getDevice();
                String name = result.getScanRecord() == null ? null : result.getScanRecord().getDeviceName();
                try {
                    if (name == null || name.trim().isEmpty()) name = device.getName();
                } catch (SecurityException ignored) {
                    name = null;
                }
                discoveredDevices.put(device.getAddress(), new BleCandidate(device, name, result.getRssi()));
            });
        }

        @Override
        public void onScanFailed(int errorCode) {
            finishPrint("BLE printer scan failed (" + errorCode + ").", false);
        }
    };

    private void showDeviceChooser() {
        stopScan();
        if (activeCall == null) return;
        if (discoveredDevices.isEmpty()) {
            finishPrint("No Bluetooth LE devices found. Turn on the printer and keep it nearby.", false);
            return;
        }

        List<BleCandidate> candidates = new ArrayList<>(discoveredDevices.values());
        candidates.sort(Comparator.comparingInt((BleCandidate candidate) -> candidate.rssi).reversed());
        String[] labels = new String[candidates.size()];
        for (int index = 0; index < candidates.size(); index++) {
            BleCandidate candidate = candidates.get(index);
            String name = candidate.name == null || candidate.name.trim().isEmpty()
                ? "Unnamed BLE device" : candidate.name.trim();
            labels[index] = name + "  |  " + candidate.device.getAddress()
                + "  |  " + candidate.rssi + " dBm";
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            finishPrint("Could not show the Bluetooth device list.", false);
            return;
        }
        new AlertDialog.Builder(activity)
            .setTitle("Choose a printer")
            .setItems(labels, (dialog, selectedIndex) -> connectTo(candidates.get(selectedIndex)))
            .setNegativeButton("Cancel", (dialog, which) -> finishPrint("Printing cancelled.", false))
            .setOnCancelListener(dialog -> finishPrint("Printing cancelled.", false))
            .show();
    }

    private void connectTo(BleCandidate candidate) {
        if (activeCall == null) return;
        try {
            gatt = candidate.device.connectGatt(getActivity(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) {
                finishPrint("Could not connect to the selected Bluetooth LE device.", false);
                return;
            }
            connectionTimeout = () -> finishPrint("Timed out connecting to the selected printer.", false);
            mainHandler.postDelayed(connectionTimeout, CONNECTION_TIMEOUT_MS);
        } catch (SecurityException error) {
            finishPrint("Bluetooth connect permission is missing. Allow Nearby devices and try again.", false);
        }
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt currentGatt, int status, int newState) {
            mainHandler.post(() -> {
                if (activeCall == null) return;
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    finishPrint("Could not connect to the printer (BLE error " + status + ").", false);
                } else if (newState == BluetoothGatt.STATE_CONNECTED) {
                    cancelTimeout(connectionTimeout);
                    boolean requestStarted;
                    try {
                        requestStarted = currentGatt.requestMtu(REQUESTED_MTU);
                    } catch (SecurityException error) {
                        finishPrint("Bluetooth connect permission is missing.", false);
                        return;
                    }
                    if (requestStarted) {
                        mtuTimeout = () -> startServiceDiscovery(currentGatt);
                        mainHandler.postDelayed(mtuTimeout, MTU_TIMEOUT_MS);
                    } else {
                        startServiceDiscovery(currentGatt);
                    }
                } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                    finishPrint("The printer disconnected before printing completed.", false);
                }
            });
        }

        @Override
        public void onMtuChanged(BluetoothGatt currentGatt, int mtu, int status) {
            mainHandler.post(() -> {
                if (activeCall == null) return;
                cancelTimeout(mtuTimeout);
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    blePayloadSize = Math.max(DEFAULT_BLE_PAYLOAD_SIZE,
                        Math.min(mtu - 3, MAX_BLE_PAYLOAD_SIZE));
                }
                startServiceDiscovery(currentGatt);
            });
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt currentGatt, int status) {
            mainHandler.post(() -> {
                if (activeCall == null) return;
                cancelTimeout(serviceDiscoveryTimeout);
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    finishPrint("Could not read the printer's BLE services.", false);
                    return;
                }
                selectBestWritableCharacteristic(currentGatt);
            });
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt currentGatt,
                BluetoothGattCharacteristic characteristic, int status) {
            mainHandler.post(() -> {
                if (activeCall == null || !writeWithResponse || characteristic != writeCharacteristic) return;
                cancelTimeout(writeTimeout);
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    finishPrint("The printer rejected receipt data (BLE error " + status + ").", false);
                    return;
                }
                printOffset += pendingChunkLength;
                writeNextChunk();
            });
        }
    };

    private void startServiceDiscovery(BluetoothGatt currentGatt) {
        if (activeCall == null || serviceDiscoveryStarted) return;
        serviceDiscoveryStarted = true;
        if (!currentGatt.discoverServices()) {
            finishPrint("Could not inspect the printer's BLE services.", false);
            return;
        }
        serviceDiscoveryTimeout = () -> finishPrint("Timed out reading the printer's BLE services.", false);
        mainHandler.postDelayed(serviceDiscoveryTimeout, SERVICE_DISCOVERY_TIMEOUT_MS);
    }

    private void selectBestWritableCharacteristic(BluetoothGatt currentGatt) {
        List<CharacteristicTarget> targets = new ArrayList<>();
        for (BluetoothGattService service : currentGatt.getServices()) {
            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                int score = scoreWritableCharacteristic(service, characteristic);
                if (score >= 0) {
                    targets.add(new CharacteristicTarget(service.getUuid(), characteristic, score));
                }
            }
        }
        if (targets.isEmpty()) {
            finishPrint("The selected device has no writable BLE characteristic.", false);
            return;
        }
        targets.sort(Comparator
            .comparingInt((CharacteristicTarget target) -> target.score).reversed()
            .thenComparing(target -> target.characteristic.getUuid().toString()));
        writeCharacteristic = targets.get(0).characteristic;
        writeWithResponse = (writeCharacteristic.getProperties()
            & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
        writeNextChunk();
    }

    private int scoreWritableCharacteristic(BluetoothGattService service,
            BluetoothGattCharacteristic characteristic) {
        int properties = characteristic.getProperties();
        boolean write = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
        boolean writeWithoutResponse = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
        if (!write && !writeWithoutResponse) return -1;

        String serviceUuid = service.getUuid().toString().replace("-", "").toLowerCase();
        String characteristicUuid = characteristic.getUuid().toString().replace("-", "").toLowerCase();
        int score = write ? 10 : 0;
        if (writeWithoutResponse) score += 5;

        if (characteristicUuid.startsWith("6e400002")) score += 100;
        else if (characteristicUuid.startsWith("0000ffe1")
            || characteristicUuid.startsWith("0000ff02")
            || characteristicUuid.startsWith("0000fff2")) score += 80;

        if (serviceUuid.startsWith("6e400001")) score += 40;
        else if (serviceUuid.startsWith("0000ffe0")
            || serviceUuid.startsWith("0000ff00")
            || serviceUuid.startsWith("0000fff0")) score += 30;
        return score;
    }

    private void writeNextChunk() {
        if (activeCall == null) return;
        if (gatt == null || writeCharacteristic == null || printData == null) {
            finishPrint("Printer connection was lost.", false);
            return;
        }
        if (printOffset >= printData.length) {
            if (!drainScheduled) {
                drainScheduled = true;
                mainHandler.postDelayed(() -> finishPrint("Receipt data sent to printer.", true), PRINTER_DRAIN_DELAY_MS);
            }
            return;
        }

        pendingChunkLength = Math.min(blePayloadSize, printData.length - printOffset);
        byte[] chunk = new byte[pendingChunkLength];
        System.arraycopy(printData, printOffset, chunk, 0, pendingChunkLength);
        int writeType = writeWithResponse
            ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;

        boolean started;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            started = gatt.writeCharacteristic(writeCharacteristic, chunk, writeType) == BluetoothGatt.GATT_SUCCESS;
        } else {
            writeCharacteristic.setWriteType(writeType);
            writeCharacteristic.setValue(chunk);
            started = gatt.writeCharacteristic(writeCharacteristic);
        }
        if (!started) {
            finishPrint("Could not send receipt data to the printer.", false);
            return;
        }
        if (writeWithResponse) {
            writeTimeout = () -> finishPrint("Timed out sending data to the printer.", false);
            mainHandler.postDelayed(writeTimeout, WRITE_TIMEOUT_MS);
        } else {
            printOffset += pendingChunkLength;
            pendingChunkLength = 0;
            if (printOffset >= printData.length) {
                writeNextChunk();
            } else {
                mainHandler.postDelayed(this::writeNextChunk, NO_RESPONSE_WRITE_INTERVAL_MS);
            }
        }
    }

    private void stopScan() {
        cancelTimeout(scanTimeout);
        if (scanner != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (SecurityException ignored) {
                scanner = null;
            }
            scanner = null;
        }
    }

    private void finishPrint(String message, boolean success) {
        mainHandler.post(() -> {
            if (activeCall == null) return;
            PluginCall call = activeCall;
            activeCall = null;
            stopScan();
            cancelTimeout(connectionTimeout);
            cancelTimeout(mtuTimeout);
            cancelTimeout(serviceDiscoveryTimeout);
            cancelTimeout(writeTimeout);
            if (gatt != null) {
                try {
                    gatt.disconnect();
                    gatt.close();
                } catch (SecurityException ignored) {
                    gatt.close();
                }
                gatt = null;
            }
            writeCharacteristic = null;
            printData = null;
            blePayloadSize = DEFAULT_BLE_PAYLOAD_SIZE;
            writeWithResponse = false;
            serviceDiscoveryStarted = false;
            drainScheduled = false;
            pendingChunkLength = 0;
            if (success) {
                JSObject result = new JSObject();
                result.put("message", message);
                call.resolve(result);
            } else {
                call.reject(message);
            }
        });
    }

    private void cancelTimeout(Runnable timeout) {
        if (timeout != null) mainHandler.removeCallbacks(timeout);
    }

    private static final class BleCandidate {
        private final BluetoothDevice device;
        private final String name;
        private final int rssi;

        private BleCandidate(BluetoothDevice device, String name, int rssi) {
            this.device = device;
            this.name = name;
            this.rssi = rssi;
        }
    }

    private static final class CharacteristicTarget {
        private final UUID serviceUuid;
        private final BluetoothGattCharacteristic characteristic;
        private final int score;

        private CharacteristicTarget(UUID serviceUuid, BluetoothGattCharacteristic characteristic, int score) {
            this.serviceUuid = serviceUuid;
            this.characteristic = characteristic;
            this.score = score;
        }
    }
}
