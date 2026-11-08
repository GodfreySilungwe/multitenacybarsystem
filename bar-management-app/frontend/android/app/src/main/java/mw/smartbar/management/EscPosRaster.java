package mw.smartbar.management;

import android.graphics.Bitmap;
import android.graphics.Color;

public final class EscPosRaster {
    private static final int PRINTER_WIDTH_DOTS = 384;
    private static final int MAX_RASTER_BYTES = 8 * 1024 * 1024;

    private EscPosRaster() {}

    public static byte[] encode(Bitmap source) {
        if (source == null || source.getWidth() <= 0 || source.getHeight() <= 0) {
            throw new IllegalArgumentException("Receipt image is invalid.");
        }

        int height = Math.max(1, Math.round((float) source.getHeight() * PRINTER_WIDTH_DOTS / source.getWidth()));
        if (height > 0xFFFF) {
            throw new IllegalArgumentException("Receipt image is too tall to print.");
        }

        int bytesPerRow = (PRINTER_WIDTH_DOTS + 7) / 8;
        long imageBytes = (long) bytesPerRow * height;
        long totalBytes = 10L + imageBytes + 5L;
        if (totalBytes > MAX_RASTER_BYTES) {
            throw new IllegalArgumentException("Receipt image is too large to print.");
        }

        Bitmap scaled = Bitmap.createScaledBitmap(source, PRINTER_WIDTH_DOTS, height, true);
        try {
            byte[] raster = new byte[(int) totalBytes];
            raster[0] = 0x1B;
            raster[1] = 0x40;
            raster[2] = 0x1D;
            raster[3] = 0x76;
            raster[4] = 0x30;
            raster[5] = 0x00;
            raster[6] = (byte) (bytesPerRow & 0xFF);
            raster[7] = (byte) ((bytesPerRow >> 8) & 0xFF);
            raster[8] = (byte) (height & 0xFF);
            raster[9] = (byte) ((height >> 8) & 0xFF);

            int[] pixels = new int[PRINTER_WIDTH_DOTS];
            for (int row = 0; row < height; row++) {
                scaled.getPixels(pixels, 0, PRINTER_WIDTH_DOTS, 0, row, PRINTER_WIDTH_DOTS, 1);
                for (int column = 0; column < PRINTER_WIDTH_DOTS; column++) {
                    int pixel = pixels[column];
                    int luminance = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000;
                    if (luminance < 180) {
                        int byteIndex = 10 + row * bytesPerRow + (column / 8);
                        raster[byteIndex] |= (byte) (0x80 >> (column % 8));
                    }
                }
            }

            int feedOffset = raster.length - 5;
            raster[feedOffset] = 0x1B;
            raster[feedOffset + 1] = 0x64;
            raster[feedOffset + 2] = 0x03;
            raster[feedOffset + 3] = 0x0A;
            raster[feedOffset + 4] = 0x0A;
            return raster;
        } finally {
            if (scaled != source) scaled.recycle();
        }
    }
}
