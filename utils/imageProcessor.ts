import { fileToImage } from './fileHelpers';

// We need to define PixelCrop locally since we can't import types from the CDN easily in this utility file
// without complicating the build.
interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: 'px';
}

interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Crops an image based on pixel coordinates.
 */
export const getCroppedImg = async (
  image: HTMLImageElement,
  crop: PixelCrop,
  type: string = 'image/jpeg'
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  
  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No 2d context');
  }

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'));
        return;
      }
      resolve(blob);
    }, type, 1.0);
  });
};

/**
 * Compresses an image to try and meet a target file size (in KB).
 * Uses a binary search approach on quality, and falls back to dimension scaling if needed.
 */
export const compressImageToTarget = async (
  file: File | Blob,
  targetSizeKB: number
): Promise<CompressionResult> => {
  const targetSizeBytes = targetSizeKB * 1024;
  const originalImage = await fileToImage(file);
  
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  let width = originalImage.width;
  let height = originalImage.height;

  // Start with original dimensions
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(originalImage, 0, 0, width, height);

  // Helper to get blob at specific quality
  const getBlob = (q: number): Promise<Blob> => {
    return new Promise((resolve) => {
      // We force JPEG for better compression control
      canvas.toBlob(
        (blob) => resolve(blob!),
        'image/jpeg',
        q
      );
    });
  };

  // Binary search for quality (0.01 to 1.0)
  let minQ = 0.01;
  let maxQ = 1.0;
  let bestBlob: Blob | null = null;
  let iterations = 0;

  // First pass: Try to find best quality at full resolution
  while (minQ <= maxQ && iterations < 10) {
    const midQ = (minQ + maxQ) / 2;
    const blob = await getBlob(midQ);

    if (blob.size <= targetSizeBytes) {
      bestBlob = blob;
      minQ = midQ + 0.05; // Try to get better quality if possible
    } else {
      maxQ = midQ - 0.05; // Reduce quality
    }
    iterations++;
  }

  // If we found a blob that fits, return it
  if (bestBlob) {
    return { blob: bestBlob, width, height };
  }

  // Second pass: If quality 0.01 is still too big, we MUST resize dimensions
  // Reset variables
  let scale = 0.9;
  iterations = 0;
  
  while (iterations < 15) {
    width = Math.floor(originalImage.width * scale);
    height = Math.floor(originalImage.height * scale);
    
    canvas.width = width;
    canvas.height = height;
    // Clear and redraw
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(originalImage, 0, 0, width, height);

    // Try lowest acceptable quality with reduced dimensions
    const blob = await getBlob(0.5); 

    if (blob.size <= targetSizeBytes) {
       // Found a fit!
       return { blob, width, height };
    }
    
    // Reduce scale further
    scale -= 0.1;
    
    if (scale < 0.1) break; // Safety break
    iterations++;
  }

  // If we still fail, return the smallest possible version we generated (last attempt)
  const finalBlob = await getBlob(0.1);
  return { blob: finalBlob, width, height };
};