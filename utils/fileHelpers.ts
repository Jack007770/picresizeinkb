/**
 * Formats a number of bytes into a human-readable string (KB or MB).
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 KB';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  // Use KB as the base unit for display if it's small enough, otherwise MB
  if (bytes < k) return `${bytes} Bytes`;
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // We prefer KB or MB for this app
  const unit = sizes[i];
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  
  return `${val} ${unit}`;
};

/**
 * Formats bytes to show both MB and KB.
 * e.g., "2.5 MB (2560 KB)"
 */
export const formatFileSizeDual = (bytes: number): string => {
  if (bytes === 0) return '0 KB';
  const kb = (bytes / 1024).toFixed(2);
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  
  if (parseFloat(mb) < 0.01) {
    return `${kb} KB`;
  }
  return `${mb} MB (${kb} KB)`;
};

/**
 * Converts a File or Blob to an Image object.
 */
export const fileToImage = (file: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};