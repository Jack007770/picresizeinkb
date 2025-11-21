import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { formatFileSizeDual } from './utils/fileHelpers';
import { compressImageToTarget, getCroppedImg } from './utils/imageProcessor';
import ImageUploader from './components/ImageUploader';
import Button from './components/Button';
import { AppState, ProcessedImage, ToastMessage, HistoryItem } from './types';

const App: React.FC = () => {
  // State
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [originalFile, setOriginalFile] = useState<File | Blob | null>(null);
  const [fileName, setFileName] = useState<string>('image.jpg');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetKB, setTargetKB] = useState<string>('');
  const [result, setResult] = useState<ProcessedImage | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // Features State
  const [darkMode, setDarkMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // History Filter/Sort State
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'newest' | 'oldest'>('newest');

  const menuRef = useRef<HTMLDivElement>(null);

  // Cropping State
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // Theme Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Click Outside Menu Effect
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup object URLs for active session
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [previewUrl, result]);

  // Cleanup history URLs on unmount (best effort, mostly for clean code practices in SPA)
  // We use a ref to access the latest history state in the cleanup function
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    return () => {
      historyRef.current.forEach(item => {
        URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Filtered History Logic
  const filteredHistory = useMemo(() => {
    return history
      .filter(item => item.fileName.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => {
        if (historySort === 'newest') {
          return b.timestamp - a.timestamp;
        }
        return a.timestamp - b.timestamp;
      });
  }, [history, historySearch, historySort]);

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  const handleImageSelect = (file: File) => {
    // Clean up previous active URLs
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (result?.url) URL.revokeObjectURL(result.url);
    
    setResult(null);
    setTargetKB('');
    setDownloaded(false);
    
    const url = URL.createObjectURL(file);
    setOriginalFile(file);
    setFileName(file.name);
    setPreviewUrl(url);
    setState(AppState.SELECTED);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        width / height,
        width,
        height
      ),
      width,
      height
    );
    setCrop(crop);
  };

  const performCrop = async () => {
    if (completedCrop && imgRef.current && originalFile) {
      try {
        const croppedBlob = await getCroppedImg(imgRef.current, completedCrop, originalFile.type);
        const newUrl = URL.createObjectURL(croppedBlob);
        
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        
        setOriginalFile(croppedBlob);
        setPreviewUrl(newUrl);
        setIsCropping(false);
        setToast({ type: 'success', text: 'Image cropped successfully' });
      } catch (e) {
        console.error(e);
        setToast({ type: 'error', text: 'Failed to crop image' });
      }
    } else {
      setIsCropping(false);
    }
  };

  const handleResize = async () => {
    if (!originalFile || !targetKB) return;
    
    const kb = parseInt(targetKB, 10);
    if (isNaN(kb) || kb <= 0) {
      setToast({ type: 'error', text: 'Please enter a valid file size in KB' });
      return;
    }

    setState(AppState.PROCESSING);

    try {
      await new Promise(r => setTimeout(r, 500));
      
      const { blob, width, height } = await compressImageToTarget(originalFile, kb);
      
      // Create ONE URL for the Result View
      const url = URL.createObjectURL(blob);
      
      // Create A SEPARATE URL for the History Item
      // This ensures that when we reset the result view (and revoke its URL),
      // the history item remains valid and visible.
      const historyUrl = URL.createObjectURL(blob);
      
      const newResult = {
        blob,
        url,
        originalSize: originalFile.size,
        newSize: blob.size,
        width,
        height
      };

      setResult(newResult);
      
      // Add to history
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        url: historyUrl, 
        fileName: fileName,
        originalSize: originalFile.size,
        newSize: blob.size,
        timestamp: Date.now()
      };
      setHistory(prev => [newItem, ...prev]);

      setState(AppState.COMPLETED);
      setToast({ type: 'success', text: 'Image resized successfully!' });
    } catch (error) {
      console.error(error);
      setToast({ type: 'error', text: 'Failed to process image.' });
      setState(AppState.SELECTED);
    }
  };

  const handleDownload = (itemUrl?: string, itemSize?: number) => {
    const urlToDownload = itemUrl || result?.url;
    const size = itemSize || result?.newSize || 0;
    
    if (!urlToDownload) return;
    
    const link = document.createElement('a');
    link.href = urlToDownload;
    link.download = `pic_resize_${Math.round(size / 1024)}kb_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if (!itemUrl) {
      setDownloaded(true);
    }
    setToast({ type: 'success', text: 'Your image is saved to your gallery' });
  };

  const handleReset = () => {
    setState(AppState.IDLE);
    setOriginalFile(null);
    setResult(null);
    setTargetKB('');
    setIsCropping(false);
    setDownloaded(false);
  };

  const handleRetrySameImage = () => {
      setState(AppState.SELECTED);
      setResult(null);
      setDownloaded(false);
  }

  const deleteHistoryItem = (id: string) => {
    const itemToDelete = history.find(item => item.id === id);
    if (itemToDelete) {
      // Clean up memory by revoking the blob URL
      URL.revokeObjectURL(itemToDelete.url);
    }
    setHistory(prev => prev.filter(item => item.id !== id));
    setToast({ type: 'success', text: 'Removed from history' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center p-4 transition-colors duration-300">
      {/* Container that simulates a mobile screen/compact card */}
      <div className="w-full max-w-sm bg-white/80 dark:bg-slate-800/90 backdrop-blur-xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-white/50 dark:border-slate-700 h-[85vh] max-h-[800px] relative transition-colors duration-300">
        
        {/* Navbar */}
        <nav className="flex-none bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border-b border-green-100 dark:border-slate-700 px-4 py-3 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className="p-1 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8 rounded-md shadow-sm">
                  <rect width="100" height="100" rx="20" fill="#2563EB"/>
                  <rect x="10" y="10" width="50" height="50" rx="8" fill="white"/>
                  <path d="M15 50L30 30L45 50H15Z" fill="#10B981"/>
                  <path d="M35 50L45 38L55 50H35Z" fill="#059669"/>
                  <circle cx="45" cy="25" r="5" fill="#FBBF24"/>
                  <path d="M65 30Q80 30 75 50" stroke="#34D399" strokeWidth="6" fill="none" strokeLinecap="round"/>
                  <path d="M75 50L70 42M75 50L82 44" stroke="#34D399" strokeWidth="6" fill="none" strokeLinecap="round"/>
                  <rect x="55" y="55" width="35" height="35" rx="6" fill="white"/>
                  <path d="M60 82L70 68L80 82H60Z" fill="#10B981"/>
                  <path d="M75 82L82 74L89 82H75Z" fill="#059669"/>
                  <circle cx="80" cy="65" r="3.5" fill="#FBBF24"/>
                </svg>
             </div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight truncate">Pic Resize in KBs</h1>
          </div>

          {/* Options Menu */}
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>

            {/* Dropdown */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                <div className="py-1">
                  <button 
                    onClick={() => {
                      setDarkMode(!darkMode);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left text-sm flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <span className="flex items-center gap-2">
                      {darkMode ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                        </svg>
                      )}
                      {darkMode ? 'Light Mode' : 'Dark Mode'}
                    </span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowHistory(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left text-sm flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-t border-slate-100 dark:border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      History
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Scrollable Content Area */}
        <main className="flex-grow overflow-y-auto p-5 scroll-smooth flex flex-col relative">
          
          {/* Step 1: Upload */}
          {state === AppState.IDLE && (
            <div className="h-full flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Resize Images Fast</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Select an image, crop it, and choose your target size in KB.</p>
               </div>
              <ImageUploader onImageSelect={handleImageSelect} />
            </div>
          )}

          {/* Step 2: Configure */}
          {(state === AppState.SELECTED || state === AppState.PROCESSING) && originalFile && previewUrl && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-4">
                <div className="bg-white dark:bg-slate-700 p-3 rounded-2xl shadow-sm border border-green-50 dark:border-slate-600">
                   {isCropping ? (
                     <div className="flex flex-col gap-3">
                       <ReactCrop
                         crop={crop}
                         onChange={(_, percentCrop) => setCrop(percentCrop)}
                         onComplete={(c) => setCompletedCrop(c)}
                         className="max-h-[40vh] object-contain bg-slate-900 rounded-lg"
                       >
                         <img 
                           ref={imgRef}
                           src={previewUrl} 
                           alt="Crop me" 
                           onLoad={onImageLoad}
                           className="max-w-full h-auto"
                         />
                       </ReactCrop>
                       <div className="grid grid-cols-2 gap-2">
                         <Button variant="secondary" onClick={() => setIsCropping(false)} className="py-2 text-sm">Cancel</Button>
                         <Button variant="primary" onClick={performCrop} className="py-2 text-sm">Apply</Button>
                       </div>
                     </div>
                   ) : (
                     <>
                       <div className="relative bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden mb-3 flex items-center justify-center min-h-[150px]">
                         <img src={previewUrl} alt="Original" className="max-w-full max-h-[35vh] object-contain" />
                         
                         <button 
                           onClick={() => setIsCropping(true)}
                           className="absolute bottom-2 right-2 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md hover:bg-black/80 transition-colors flex items-center gap-1.5"
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                            </svg>
                            Crop
                         </button>
                       </div>
                       
                       <div className="flex items-center justify-between px-2">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Original Size</p>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatFileSizeDual(originalFile.size)}</p>
                          </div>
                          <button 
                            onClick={handleReset}
                            className="text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                          >
                            Change
                          </button>
                       </div>
                     </>
                   )}
                </div>

              {!isCropping && (
                <div className="bg-white dark:bg-slate-700 p-5 rounded-2xl shadow-sm border border-green-50 dark:border-slate-600">
                   <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                     Target File Size (KB)
                   </label>
                   <div className="relative mb-5">
                     <input 
                       type="number" 
                       inputMode="decimal"
                       value={targetKB}
                       onChange={(e) => setTargetKB(e.target.value)}
                       placeholder="e.g. 50"
                       className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-lg font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-300 transition-all"
                     />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">KB</span>
                   </div>
                   
                   <Button 
                     fullWidth 
                     onClick={handleResize}
                     disabled={state === AppState.PROCESSING || !targetKB}
                     variant="primary"
                     className="shadow-green-500/20"
                   >
                     {state === AppState.PROCESSING ? 'Processing...' : 'Resize Image'}
                   </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Result - Full Height Layout */}
          {state === AppState.COMPLETED && result && (
            <div className="flex flex-col h-full animate-in zoom-in-95 duration-300 pb-2 gap-3">
               {/* Success Banner */}
               <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-4 py-2 rounded-xl flex items-center justify-center gap-2 flex-shrink-0 shadow-sm border border-green-200 dark:border-green-800">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                  <span className="font-bold text-sm">Resized Successfully!</span>
               </div>

               {/* Image Preview - Takes up maximum space available */}
               <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700 relative overflow-hidden min-h-[200px]">
                  <img 
                    src={result.url} 
                    alt="Resized Result" 
                    className="absolute inset-0 w-full h-full object-contain p-2" 
                  />
               </div>

               {/* Stats Card */}
               <div className="bg-white dark:bg-slate-700 border border-green-100 dark:border-slate-600 rounded-2xl p-4 shadow-md flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                     <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Original</span>
                     <span className="text-sm text-slate-500 dark:text-slate-300 font-medium line-through decoration-red-400">{formatFileSizeDual(result.originalSize)}</span>
                  </div>
                  <div className="w-full h-px bg-slate-100 dark:bg-slate-600 mb-2"></div>
                  <div className="flex flex-col items-center justify-center bg-green-50 dark:bg-green-900/20 rounded-xl p-2 border border-green-100 dark:border-green-800">
                     <span className="text-xs text-green-600 dark:text-green-400 uppercase font-bold tracking-wider">Result Size</span>
                     <span className="text-xl font-black text-green-700 dark:text-green-300">{formatFileSizeDual(result.newSize)}</span>
                  </div>
               </div>

               {/* Actions */}
               <div className="space-y-2 flex-shrink-0">
                  <button 
                    onClick={() => handleDownload()}
                    className="w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                    </svg>
                    {downloaded ? 'Saved to Gallery' : 'Download Image'}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="secondary" 
                      onClick={handleRetrySameImage}
                      className="py-2 text-xs font-bold bg-green-50 dark:bg-slate-700 text-green-700 dark:text-green-300 border border-green-100 dark:border-slate-600"
                    >
                      Resize Again
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleReset}
                      className="py-2 text-xs font-bold border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                    >
                      Choose Another
                    </Button>
                  </div>
               </div>
            </div>
          )}

          {/* History Modal */}
          {showHistory && (
            <div className="absolute inset-0 z-40 bg-white dark:bg-slate-800 animate-in slide-in-from-right duration-300 flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white/50 dark:bg-slate-800/50 backdrop-blur">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">History</h2>
                <button 
                  onClick={() => {
                    setShowHistory(false);
                    setHistorySearch('');
                  }}
                  className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Search and Sort Controls */}
              <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search files..."
                    className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg leading-5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm transition-colors"
                  />
                </div>
                <button
                  onClick={() => setHistorySort(prev => prev === 'newest' ? 'oldest' : 'newest')}
                  className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors min-w-[90px] justify-center"
                >
                  {historySort === 'newest' ? 'Newest ↓' : 'Oldest ↑'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-2 opacity-50">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>{history.length === 0 ? 'No history yet' : 'No matches found'}</p>
                  </div>
                ) : (
                  filteredHistory.map((item) => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                       {/* Image Thumbnail - Larger and clear */}
                       <div className="w-24 h-24 rounded-lg bg-slate-200 dark:bg-slate-600 overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-600 shadow-sm">
                          <img src={item.url} alt="" className="w-full h-full object-contain bg-white dark:bg-slate-800" />
                       </div>
                       
                       <div className="flex-1 min-w-0 py-1">
                          <p className="text-sm font-bold text-slate-800 dark:text-white truncate mb-1">{item.fileName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 opacity-70">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                             </svg>
                             {formatDate(item.timestamp)}
                          </p>
                          <div className="flex flex-col gap-1 text-xs">
                             <div className="flex items-center gap-1">
                                <span className="text-slate-400 w-12">Original:</span>
                                <span className="text-slate-500 dark:text-slate-400 line-through decoration-red-300">{formatFileSizeDual(item.originalSize)}</span>
                             </div>
                             <div className="flex items-center gap-1">
                                <span className="text-slate-400 w-12">Resized:</span>
                                <span className="text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">{formatFileSizeDual(item.newSize)}</span>
                             </div>
                          </div>
                       </div>

                       <div className="flex flex-col gap-2 py-1">
                          <button 
                            onClick={() => handleDownload(item.url, item.newSize)}
                            className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                            title="Download again"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                               <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                             </svg>
                          </button>
                          <button 
                            onClick={() => deleteHistoryItem(item.id)}
                            className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                            title="Remove from history"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                               <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.49 1.478l-.56 12.29c-.03.816-.7 1.479-1.516 1.479H6.165c-.816 0-1.486-.663-1.516-1.479l-.56-12.29a48.816 48.816 0 01-3.458-.512.75.75 0 11.49-1.478 48.53 48.53 0 013.96-.512V4.478C5.093 3.29 5.884 2.25 7.017 2.25h9.966c1.133 0 1.924 1.04 1.924 2.228zM9 7.5A.75.75 0 019.75 7.5v9a.75.75 0 01-1.5 0v-9A.75.75 0 019 7.5zm3 0a.75.75 0 01.75.75v9a.75.75 0 01-1.5 0v-9A.75.75 0 0112 7.5zm3 0a.75.75 0 01.75.75v9a.75.75 0 01-1.5 0v-9a.75.75 0 01.75-.75z" clipRule="evenodd" />
                             </svg>
                          </button>
                       </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>

        {/* Toast */}
        {toast && (
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[300px] px-4 py-3 rounded-xl shadow-2xl z-50 transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in ${
            toast.type === 'success' ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'bg-red-500 text-white'
          }`}>
            <div className="flex items-center justify-center gap-2 text-center">
               {toast.type === 'success' && (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400 dark:text-green-600 flex-shrink-0">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
               )}
               <span className="font-semibold text-xs">{toast.text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;