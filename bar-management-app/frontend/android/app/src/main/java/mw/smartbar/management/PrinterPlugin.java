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
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

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
    private static final long SERVICE_DISCOVERY_TIMEOUT_MS = 12000;
    private static final long WRITE_TIMEOUT_MS = 8000;
    private static final int CHUNK_SIZE = 20;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, BleCandidate> discoveredDevices = new LinkedHashMap<>();
    private PluginCall activeCall;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeCharacteristic;
    private byte[] printData;
    private int printOffset;
    private int pendingChunkLength;
    private Runnable scanTimeout;
    private Runnable connectionTimeout;
    private Runnable serviceDiscoveryTimeout;
    private Runnable writeTimeout;

    @PluginMethod
    public void printText(PluginCall call) {
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
        if (text.trim().isEmpty()) {
            call.reject("Receipt text is empty.");
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

        activeCall = call;
        startBleScan(adapter);
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
                    if (!currentGatt.discoverServices()) {
                        finishPrint("Could not inspect the printer's BLE services.", false);
                    } else {
                        serviceDiscoveryTimeout = () -> finishPrint(
                            "Timed out reading the printer profile. Use Choose printer and print to scan again.", false);
                        mainHandler.postDelayed(serviceDiscoveryTimeout, SERVICE_DISCOVERY_TIMEOUT_MS);
                    }
                } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                    finishPrint("The printer disconnected before printing completed.", false);
                }
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
                if (activeCall == null || characteristic != writeCharacteristic) return;
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
        prepareReceiptData();
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

    private void prepareReceiptData() {
        String text = activeCall.getString("text", "");
        byte[] receipt = text.getBytes(StandardCharsets.UTF_8);
        printData = new byte[receipt.length + 5];
        printData[0] = 0x1B;
        printData[1] = 0x40;
        System.arraycopy(receipt, 0, printData, 2, receipt.length);
        printData[receipt.length + 2] = 0x0A;
        printData[receipt.length + 3] = 0x0A;
        printData[receipt.length + 4] = 0x0A;
        printOffset = 0;
    }

    private void writeNextChunk() {
        if (activeCall == null) return;
        if (gatt == null || writeCharacteristic == null || printData == null) {
            finishPrint("Printer connection was lost.", false);
            return;
        }
        if (printOffset >= printData.length) {
            finishPrint("Receipt data sent to printer.", true);
            return;
        }

        pendingChunkLength = Math.min(CHUNK_SIZE, printData.length - printOffset);
        byte[] chunk = new byte[pendingChunkLength];
        System.arraycopy(printData, printOffset, chunk, 0, pendingChunkLength);
        int properties = writeCharacteristic.getProperties();
        int writeType = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
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
        writeTimeout = () -> finishPrint("Timed out sending data to the printer.", false);
        mainHandler.postDelayed(writeTimeout, WRITE_TIMEOUT_MS);
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
