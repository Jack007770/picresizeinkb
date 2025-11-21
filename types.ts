export interface ProcessedImage {
  blob: Blob;
  url: string;
  originalSize: number;
  newSize: number;
  width: number;
  height: number;
}

export enum AppState {
  IDLE = 'IDLE',
  SELECTED = 'SELECTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

export interface ToastMessage {
  type: 'success' | 'error';
  text: string;
}

export interface HistoryItem {
  id: string;
  url: string;
  fileName: string;
  originalSize: number;
  newSize: number;
  timestamp: number;
}
