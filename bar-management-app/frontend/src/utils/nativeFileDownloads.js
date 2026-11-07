import { Directory, Filesystem } from '@capacitor/filesystem';

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.onerror = () => reject(new Error('Could not prepare the export for Android storage.'));
  reader.readAsDataURL(blob);
});

export const saveBlobToAndroidDocuments = async (blob, filename) => {
  const permission = await Filesystem.checkPermissions();
  const storagePermission = permission.publicStorage === 'granted'
    ? permission
    : await Filesystem.requestPermissions();
  if (storagePermission.publicStorage !== 'granted') {
    throw new Error('Storage permission is required to save this export.');
  }

  const data = await blobToBase64(blob);
  await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents });
  const file = await Filesystem.stat({ path: filename, directory: Directory.Documents });
  if (file.size <= 0) {
    throw new Error('The export file is empty. Please try again.');
  }
  return file;
};
