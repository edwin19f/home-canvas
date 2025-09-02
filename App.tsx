/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateCompositeImage, generateProductSilhouette, generateInteriorDesign, modifySurface } from './services/geminiService';
import { Product } from './types';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import ObjectCard from './components/ObjectCard';
import Spinner from './components/Spinner';
import DebugModal from './components/DebugModal';
import TouchGhost from './components/TouchGhost';
import InteriorDesigner from './components/InteriorDesigner';
import PlacementContextMenu from './components/PlacementContextMenu';
import SurfaceModificationModal from './components/SurfaceModificationModal';

// Pre-load a transparent image to use for hiding the default drag ghost.
// This prevents a race condition on the first drag.
const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

// Helper to convert a File object to a base64 data URL
const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};


const loadingMessages = [
    "Analyzing your product...",
    "Surveying the scene...",
    "Describing placement location with AI...",
    "Crafting the perfect composition prompt...",
    "Generating photorealistic options...",
    "Assembling the final scene..."
];


const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'productPlacement' | 'interiorDesign'>('productPlacement');
  const [products, setProducts] = useState<Product[]>([]);
  const [productFiles, setProductFiles] = useState<Map<number, File>>(new Map());
  const [activeProductId, setActiveProductId] = useState<number | null>(null);
  const [sceneImage, setSceneImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [persistedOrbPosition, setPersistedOrbPosition] = useState<{x: number, y: number} | null>(null);
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [sceneDesignPrompt, setSceneDesignPrompt] = useState('');
  const [placementContextMenu, setPlacementContextMenu] = useState<{
    screenX: number;
    screenY: number;
    containerX: number;
    containerY: number;
    relativeX: number;
    relativeY: number;
  } | null>(null);

  const [surfaceModificationState, setSurfaceModificationState] = useState<{
    type: 'color' | 'texture';
    position: { xPercent: number; yPercent: number; };
  } | null>(null);

  // State for touch drag & drop
  const [isTouchDragging, setIsTouchDragging] = useState<boolean>(false);
  const [touchGhostPosition, setTouchGhostPosition] = useState<{x: number, y: number} | null>(null);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState<boolean>(false);
  const [touchOrbPosition, setTouchOrbPosition] = useState<{x: number, y: number} | null>(null);
  const sceneImgRef = useRef<HTMLImageElement>(null);
  const addProductInputRef = useRef<HTMLInputElement>(null);
  
  // State for undo/redo feature
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const undoHistoryRef = useRef<File[]>([]);
  const redoHistoryRef = useRef<File[]>([]);
  const isInitialLoad = useRef(true); // Flag to prevent saving on first load
  
  const sceneImageUrl = sceneImage ? URL.createObjectURL(sceneImage) : null;
  const activeProduct = products.find(p => p.id === activeProductId) || null;

  const handleAddProduct = useCallback(async (file: File) => {
    setError(null);
    try {
        const imageUrl = URL.createObjectURL(file);
        const newProduct: Product = {
            id: Date.now(),
            name: file.name,
            imageUrl: imageUrl,
        };
        
        setProducts(prev => [...prev, newProduct]);
        setProductFiles(prev => new Map(prev).set(newProduct.id, file));
        setActiveProductId(newProduct.id); // Select the new product automatically

        // Asynchronously generate silhouette and update the product state
        try {
            const silhouetteUrl = await generateProductSilhouette(file);
            setProducts(prevProducts => 
                prevProducts.map(p => 
                    p.id === newProduct.id ? { ...p, silhouetteUrl } : p
                )
            );
        } catch (silhouetteError) {
            console.warn('Could not generate product silhouette:', silhouetteError);
            // Non-fatal, the app can continue without the silhouette.
        }

    } catch(err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Could not load the product image. Details: ${errorMessage}`);
      console.error(err);
    }
  }, []);

  // On Mount: Load saved state from localStorage
  useEffect(() => {
    const savedStateJSON = localStorage.getItem('homeCanvasState');
    if (savedStateJSON) {
        try {
            const savedState = JSON.parse(savedStateJSON);
            const { products: savedProducts, scene, undoHistory, redoHistory, activeProductId: savedActiveId } = savedState;

            if (savedProducts && Array.isArray(savedProducts)) {
                const loadedProducts: Product[] = [];
                const loadedFiles = new Map<number, File>();
                for (const item of savedProducts) {
                    if (item && item.product && item.dataUrl) {
                        const productFile = dataURLtoFile(item.dataUrl, item.product.name);
                        // Re-create blob URL as it's not persistent across sessions
                        item.product.imageUrl = URL.createObjectURL(productFile);
                        loadedProducts.push(item.product);
                        loadedFiles.set(item.product.id, productFile);
                    }
                }
                setProducts(loadedProducts);
                setProductFiles(loadedFiles);
                if (savedActiveId && loadedProducts.some(p => p.id === savedActiveId)) {
                    setActiveProductId(savedActiveId);
                }
            }
            if (scene) {
                const sceneFile = dataURLtoFile(scene.dataUrl, scene.name);
                setSceneImage(sceneFile);
            }
            if (undoHistory && Array.isArray(undoHistory) && undoHistory.length > 0) {
                const historyFiles = undoHistory.map((item: any) => dataURLtoFile(item.dataUrl, item.name));
                undoHistoryRef.current = historyFiles;
                setCanUndo(true);
            }
            if (redoHistory && Array.isArray(redoHistory) && redoHistory.length > 0) {
                const historyFiles = redoHistory.map((item: any) => dataURLtoFile(item.dataUrl, item.name));
                redoHistoryRef.current = historyFiles;
                setCanRedo(true);
            }
        } catch (e) {
            console.error("Failed to load saved state:", e);
            localStorage.removeItem('homeCanvasState');
        }
    }
    isInitialLoad.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: handleAddProduct is not a dependency to avoid re-running on every render. Load should only happen once.

  // On Change: Save state automatically to localStorage
  useEffect(() => {
    if (isInitialLoad.current || isLoading) {
        return; // Don't save on initial load or while generating
    }

    const saveState = async () => {
        try {
            const productData = await Promise.all(
                products.map(async (product) => {
                    const file = productFiles.get(product.id);
                    if (!file) return null;
                    // We save the product object itself, but not the ephemeral imageUrl (blob URL)
                    const { imageUrl, ...productToSave } = product;
                    return {
                        product: productToSave,
                        dataUrl: await fileToDataURL(file),
                    };
                })
            );

            const scene = sceneImage ? {
                dataUrl: await fileToDataURL(sceneImage),
                name: sceneImage.name,
            } : null;

            const undoHistory = await Promise.all(
                undoHistoryRef.current.map(async (file) => ({
                    dataUrl: await fileToDataURL(file),
                    name: file.name,
                }))
            );
            
            const redoHistory = await Promise.all(
                redoHistoryRef.current.map(async (file) => ({
                    dataUrl: await fileToDataURL(file),
                    name: file.name,
                }))
            );

            const stateToSave = { 
              products: productData.filter(Boolean), 
              scene, 
              undoHistory,
              redoHistory,
              activeProductId 
            };
            localStorage.setItem('homeCanvasState', JSON.stringify(stateToSave));

        } catch (e) {
            console.error("Failed to auto-save state:", e);
        }
    };

    // Debounce the save function to avoid rapid writes
    const timer = setTimeout(saveState, 500);
    return () => clearTimeout(timer);

  }, [products, productFiles, sceneImage, activeProductId, isLoading, canUndo, canRedo]);


  const handleInstantStart = useCallback(async () => {
    setError(null);
    try {
      // Fetch the default images
      const [objectResponse, sceneResponse] = await Promise.all([
        fetch('/assets/object.jpeg'),
        fetch('/assets/scene.jpeg')
      ]);

      if (!objectResponse.ok || !sceneResponse.ok) {
        throw new Error('Failed to load default images');
      }

      // Convert to blobs then to File objects
      const [objectBlob, sceneBlob] = await Promise.all([
        objectResponse.blob(),
        sceneResponse.blob()
      ]);

      const objectFile = new File([objectBlob], 'object.jpeg', { type: 'image/jpeg' });
      const sceneFile = new File([sceneBlob], 'scene.jpeg', { type: 'image/jpeg' });
      
      // Clear history and products for a fresh start
      undoHistoryRef.current = [];
      redoHistoryRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setProducts([]);
      setProductFiles(new Map());
      setActiveProductId(null);

      // Update state with the new files
      setSceneImage(sceneFile);
      await handleAddProduct(objectFile);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Could not load default images. Details: ${errorMessage}`);
      console.error(err);
    }
  }, [handleAddProduct]);

  const handleProductDrop = useCallback(async (
    position: {x: number, y: number}, 
    relativePosition: { xPercent: number; yPercent: number; },
    placementStyle: 'on_surface' | 'against_wall'
  ) => {
    const currentActiveProduct = products.find(p => p.id === activeProductId);
    const currentActiveProductFile = activeProductId ? productFiles.get(activeProductId) : null;

    if (!currentActiveProductFile || !sceneImage || !currentActiveProduct) {
      setError('Please select a product before placing it.');
      return;
    }
    const previousScene = sceneImage; // Keep track of the scene before generation for undo
    setPersistedOrbPosition(position);
    setIsLoading(true);
    setError(null);
    try {
      const { finalImageUrl, debugImageUrl, finalPrompt } = await generateCompositeImage(
        currentActiveProductFile, 
        currentActiveProduct.name,
        sceneImage,
        sceneImage.name,
        relativePosition,
        placementStyle
      );
      setDebugImageUrl(debugImageUrl);
      setDebugPrompt(finalPrompt);
      const newSceneFile = dataURLtoFile(finalImageUrl, `generated-scene-${Date.now()}.jpeg`);
      setSceneImage(newSceneFile);

      // Add the previous state to history for the undo action
      undoHistoryRef.current.push(previousScene);
      if (undoHistoryRef.current.length > 10) { // Limit history size
        undoHistoryRef.current.shift();
      }
      // Any new action clears the redo history
      redoHistoryRef.current = [];
      setCanUndo(true);
      setCanRedo(false);

    } catch (err)
 {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to generate the image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setPersistedOrbPosition(null);
    }
  }, [productFiles, sceneImage, products, activeProductId]);

  const closeContextMenu = useCallback(() => {
    setPlacementContextMenu(null);
    setPersistedOrbPosition(null);
  }, []);

  const handlePlaceProductAction = useCallback((placementStyle: 'on_surface' | 'against_wall') => {
    if (!placementContextMenu || !activeProduct) return;
    handleProductDrop(
        { x: placementContextMenu.containerX, y: placementContextMenu.containerY },
        { xPercent: placementContextMenu.relativeX, yPercent: placementContextMenu.relativeY },
        placementStyle
    );
    setPlacementContextMenu(null);
  }, [placementContextMenu, activeProduct, handleProductDrop]);
  
  const handleModifySurfaceRequest = useCallback((type: 'color' | 'texture') => {
    if (!placementContextMenu) return;
    setSurfaceModificationState({
        type: type,
        position: {
            xPercent: placementContextMenu.relativeX,
            yPercent: placementContextMenu.relativeY,
        },
    });
    closeContextMenu();
  }, [placementContextMenu, closeContextMenu]);

  const handlePlacementRequest = useCallback((
      position: { clientX: number, clientY: number, containerX: number, containerY: number },
      relativePosition: { xPercent: number, yPercent: number }
  ) => {
      if (isLoading) return; // Don't show menu if busy
      setPlacementContextMenu({
          screenX: position.clientX,
          screenY: position.clientY,
          containerX: position.containerX,
          containerY: position.containerY,
          relativeX: relativePosition.xPercent,
          relativeY: relativePosition.yPercent,
      });
      // Show a visual marker where the click happened
      setPersistedOrbPosition({ x: position.containerX, y: position.containerY });
  }, [isLoading]);

  const handleSceneDesignGeneration = useCallback(async () => {
    if (!sceneImage || !sceneDesignPrompt.trim()) {
        setError('Please provide a scene image and a design instruction.');
        return;
    }

    const previousScene = sceneImage; // For undo
    setIsLoading(true);
    setError(null);
    setPersistedOrbPosition(null); // Clear any placement markers

    try {
        const generatedImageUrl = await generateInteriorDesign(sceneImage, sceneDesignPrompt);
        const newSceneFile = dataURLtoFile(generatedImageUrl, `redesigned-scene-${Date.now()}.jpeg`);
        setSceneImage(newSceneFile);

        // Add the previous state to history for the undo action
        undoHistoryRef.current.push(previousScene);
        if (undoHistoryRef.current.length > 10) { // Limit history size
            undoHistoryRef.current.shift();
        }
        // Any new action clears the redo history
        redoHistoryRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
        setSceneDesignPrompt(''); // Clear prompt on success

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to generate the design. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [sceneImage, sceneDesignPrompt]);

    const handleSurfaceModificationSubmit = useCallback(async (modificationValue: string) => {
        if (!surfaceModificationState || !sceneImage) return;

        const { type, position } = surfaceModificationState;
        setSurfaceModificationState(null); // Close the modal
        
        const previousScene = sceneImage; // For undo
        setIsLoading(true);
        setError(null);
        setPersistedOrbPosition(null);
        
        try {
            const generatedImageUrl = await modifySurface(
                sceneImage,
                position,
                type,
                modificationValue
            );
            const newSceneFile = dataURLtoFile(generatedImageUrl, `modified-scene-${Date.now()}.jpeg`);
            setSceneImage(newSceneFile);

            // Add the previous state to history
            undoHistoryRef.current.push(previousScene);
            if (undoHistoryRef.current.length > 10) {
                undoHistoryRef.current.shift();
            }
            redoHistoryRef.current = [];
            setCanUndo(true);
            setCanRedo(false);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`Failed to modify the surface. ${errorMessage}`);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [surfaceModificationState, sceneImage]);

  const handleReset = useCallback(() => {
    setProducts([]);
    setProductFiles(new Map());
    setActiveProductId(null);
    setSceneImage(null);
    setError(null);
    setIsLoading(false);
    setPersistedOrbPosition(null);
    setDebugImageUrl(null);
    setDebugPrompt(null);
    setSceneDesignPrompt('');
    setPlacementContextMenu(null);
    setSurfaceModificationState(null);
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    localStorage.removeItem('homeCanvasState');
  }, []);
  
  const handleUndo = useCallback(() => {
    if (undoHistoryRef.current.length === 0 || !sceneImage) return;

    const previousScene = undoHistoryRef.current.pop();
    if (previousScene) {
        redoHistoryRef.current.push(sceneImage);
        setSceneImage(previousScene);
    }
    setCanUndo(undoHistoryRef.current.length > 0);
    setCanRedo(true);
  }, [sceneImage]);

  const handleRedo = useCallback(() => {
      if (redoHistoryRef.current.length === 0 || !sceneImage) return;

      const nextScene = redoHistoryRef.current.pop();
      if (nextScene) {
          undoHistoryRef.current.push(sceneImage);
          setSceneImage(nextScene);
      }
      setCanRedo(redoHistoryRef.current.length > 0);
      setCanUndo(true);
  }, [sceneImage]);
  
  const handleChangeScene = useCallback(() => {
    setSceneImage(null);
    setPersistedOrbPosition(null);
    setDebugImageUrl(null);
    setDebugPrompt(null);
    setSceneDesignPrompt('');
    setPlacementContextMenu(null);
    setSurfaceModificationState(null);
    // Changing the scene resets the history
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  useEffect(() => {
    // Clean up the scene's object URL when the component unmounts or the URL changes
    return () => {
        if (sceneImageUrl) URL.revokeObjectURL(sceneImageUrl);
    };
  }, [sceneImageUrl]);
  
  useEffect(() => {
    // Clean up all product object URLs on change or unmount
    return () => {
        products.forEach(product => {
            if (product.imageUrl && product.imageUrl.startsWith('blob:')) {
                URL.revokeObjectURL(product.imageUrl);
            }
        });
    };
  }, [products]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLoading) {
        setLoadingMessageIndex(0); // Reset on start
        interval = setInterval(() => {
            setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
        }, 3000);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!activeProduct || placementContextMenu) return;
    // Prevent page scroll
    e.preventDefault();
    setIsTouchDragging(true);
    const touch = e.touches[0];
    setTouchGhostPosition({ x: touch.clientX, y: touch.clientY });
  };
  
  const handleDragStart = (e: React.DragEvent) => {
      if (!activeProduct || placementContextMenu) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
  }

  const handleNewProductFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        handleAddProduct(file);
    }
    // Reset the input value to allow uploading the same file again
    if (addProductInputRef.current) {
        addProductInputRef.current.value = "";
    }
  };

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchDragging) return;
      const touch = e.touches[0];
      setTouchGhostPosition({ x: touch.clientX, y: touch.clientY });
      
      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = elementUnderTouch?.closest<HTMLDivElement>('[data-dropzone-id="scene-uploader"]');

      if (dropZone) {
          const rect = dropZone.getBoundingClientRect();
          setTouchOrbPosition({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
          setIsHoveringDropZone(true);
      } else {
          setIsHoveringDropZone(false);
          setTouchOrbPosition(null);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isTouchDragging) return;
      
      const touch = e.changedTouches[0];
      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = elementUnderTouch?.closest<HTMLDivElement>('[data-dropzone-id="scene-uploader"]');

      if (dropZone && sceneImgRef.current) {
          const img = sceneImgRef.current;
          const containerRect = dropZone.getBoundingClientRect();
          const { naturalWidth, naturalHeight } = img;
          const { width: containerWidth, height: containerHeight } = containerRect;

          const imageAspectRatio = naturalWidth / naturalHeight;
          const containerAspectRatio = containerWidth / containerHeight;

          let renderedWidth, renderedHeight;
          if (imageAspectRatio > containerAspectRatio) {
              renderedWidth = containerWidth;
              renderedHeight = containerWidth / imageAspectRatio;
          } else {
              renderedHeight = containerHeight;
              renderedWidth = containerHeight * imageAspectRatio;
          }
          
          const offsetX = (containerWidth - renderedWidth) / 2;
          const offsetY = (containerHeight - renderedHeight) / 2;

          const dropX = touch.clientX - containerRect.left;
          const dropY = touch.clientY - containerRect.top;

          const imageX = dropX - offsetX;
          const imageY = dropY - offsetY;
          
          if (!(imageX < 0 || imageX > renderedWidth || imageY < 0 || imageY > renderedHeight)) {
            const xPercent = (imageX / renderedWidth) * 100;
            const yPercent = (imageY / renderedHeight) * 100;
            
            handlePlacementRequest(
              { clientX: touch.clientX, clientY: touch.clientY, containerX: dropX, containerY: dropY },
              { xPercent, yPercent }
            );
          }
      }

      setIsTouchDragging(false);
      setTouchGhostPosition(null);
      setIsHoveringDropZone(false);
      setTouchOrbPosition(null);
    };

    if (isTouchDragging) {
      document.body.style.overflow = 'hidden'; // Prevent scrolling
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isTouchDragging, handlePlacementRequest]);

  const renderProductPlacementContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-50 border border-red-200 p-8 rounded-lg max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-4 text-red-800">An Error Occurred</h2>
            <p className="text-lg text-red-700 mb-6">{error}</p>
            <button
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
              >
                Start Over
            </button>
          </div>
        );
    }
    
    if (products.length === 0 || !sceneImage) {
      return (
        <div className="w-full max-w-6xl mx-auto animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col">
              <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Upload Product</h2>
              <ImageUploader 
                id="product-uploader"
                onFileSelect={handleAddProduct}
                imageUrl={products.length > 0 ? products[products.length - 1].imageUrl : null}
              />
            </div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Upload Scene</h2>
              <ImageUploader 
                id="scene-uploader"
                onFileSelect={setSceneImage}
                imageUrl={sceneImageUrl}
              />
            </div>
          </div>
          <div className="text-center mt-10 min-h-[4rem] flex flex-col justify-center items-center">
            <p className="text-zinc-500 animate-fade-in">
              Upload a product image and a scene image to begin.
            </p>
            <p className="text-zinc-500 animate-fade-in mt-2">
              Or click{' '}
              <button
                onClick={handleInstantStart}
                className="font-bold text-blue-600 hover:text-blue-800 underline transition-colors"
              >
                here
              </button>
              {' '}for an instant start.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-7xl mx-auto animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-stretch">
          {/* Product Column */}
          <div className="lg:col-span-1 flex flex-col">
            <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Products</h2>
            <div className="flex-grow overflow-y-auto space-y-4 p-2 border border-zinc-200 rounded-lg bg-zinc-50/50 min-h-[40vh] md:min-h-0">
                {products.map(product => (
                    <div 
                        key={product.id}
                        draggable={product.id === activeProductId && !placementContextMenu}
                        onDragStart={handleDragStart}
                        onTouchStart={handleTouchStart}
                        className={product.id === activeProductId ? 'cursor-move' : ''}
                    >
                        <ObjectCard 
                            product={product} 
                            isSelected={product.id === activeProductId} 
                            onClick={() => setActiveProductId(product.id)}
                        />
                    </div>
                ))}
            </div>
            <div className="text-center mt-4">
                <input
                    type="file"
                    ref={addProductInputRef}
                    onChange={handleNewProductFileChange}
                    accept="image/png, image/jpeg"
                    className="hidden"
                />
                <button
                    onClick={() => addProductInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors shadow-sm"
                >
                    + Add Product
                </button>
            </div>
          </div>
          {/* Scene Column */}
          <div className="lg:col-span-3 flex flex-col">
            <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Scene</h2>
            <div className="flex-grow flex items-center justify-center">
              <ImageUploader 
                  ref={sceneImgRef}
                  id="scene-uploader" 
                  onFileSelect={handleChangeScene} 
                  imageUrl={sceneImageUrl}
                  isDropZone={!!sceneImage && !isLoading}
                  onPlacementRequest={handlePlacementRequest}
                  persistedOrbPosition={persistedOrbPosition}
                  showDebugButton={!!debugImageUrl && !isLoading}
                  onDebugClick={() => setIsDebugModalOpen(true)}
                  isTouchHovering={isHoveringDropZone}
                  touchOrbPosition={touchOrbPosition}
                  productSilhouetteUrl={activeProduct?.silhouetteUrl}
              />
            </div>
            <div className="mt-4">
                {sceneImage && !isLoading && (
                    <div className="w-full mx-auto p-4 border border-zinc-200 rounded-lg bg-zinc-50/50 animate-fade-in">
                        <label htmlFor="scene-design-prompt" className="block text-md font-bold text-zinc-800 mb-2 text-left">
                            Or, Redesign the Entire Scene
                        </label>
                        <textarea
                            id="scene-design-prompt"
                            rows={3}
                            className="w-full p-2 bg-white border border-zinc-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="e.g., Make this room minimalist with a beige sofa."
                            value={sceneDesignPrompt}
                            onChange={(e) => setSceneDesignPrompt(e.target.value)}
                            disabled={isLoading}
                        />
                        <div className="flex flex-col sm:flex-row gap-3 mt-3">
                            <button
                                onClick={handleSceneDesignGeneration}
                                disabled={isLoading || !sceneDesignPrompt.trim()}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-zinc-400 disabled:cursor-not-allowed"
                            >
                                Generate Redesign
                            </button>
                            <button
                                onClick={handleChangeScene}
                                disabled={isLoading}
                                className="flex-1 sm:flex-none bg-white hover:bg-zinc-100 text-zinc-800 font-semibold py-2 px-4 rounded-lg transition-colors border border-zinc-200"
                            >
                                Change Scene
                            </button>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </div>
        <div className="text-center mt-10 min-h-[8rem] flex flex-col justify-center items-center">
           {isLoading ? (
             <div className="animate-fade-in">
                <Spinner />
                <p className="text-xl mt-4 text-zinc-600 transition-opacity duration-500">{loadingMessages[loadingMessageIndex]}</p>
             </div>
           ) : (
             <p className="text-zinc-500 animate-fade-in">
                {activeProductId === null 
                    ? "Select a product from the list to begin."
                    : "Drag or click on the scene to place the selected product or modify a surface."
                }
             </p>
           )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-white text-zinc-800 flex items-center justify-center p-4 md:p-8">
      {placementContextMenu && (
        <PlacementContextMenu
            position={{ x: placementContextMenu.screenX, y: placementContextMenu.screenY }}
            onPlaceOnSurface={() => handlePlaceProductAction('on_surface')}
            onPlaceAgainstWall={() => handlePlaceProductAction('against_wall')}
            onChangeColor={() => handleModifySurfaceRequest('color')}
            onChangeTexture={() => handleModifySurfaceRequest('texture')}
            onClose={closeContextMenu}
            isProductSelected={!!activeProduct}
        />
      )}
      <SurfaceModificationModal
        isOpen={!!surfaceModificationState}
        onClose={() => setSurfaceModificationState(null)}
        onSubmit={handleSurfaceModificationSubmit}
        type={surfaceModificationState?.type || 'color'}
      />
      <TouchGhost 
        imageUrl={isTouchDragging ? activeProduct?.imageUrl ?? null : null} 
        position={touchGhostPosition}
      />
      <div className="flex flex-col items-center gap-8 w-full">
        <Header />
        
        {/* Action Controls */}
        <div className="w-full max-w-lg mx-auto flex items-center justify-center gap-3 p-2 bg-zinc-100 rounded-xl">
            <button
                onClick={handleUndo}
                disabled={!canUndo || isLoading}
                className="flex-1 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors border border-zinc-200 shadow-sm disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
            >
                Undo
            </button>
            <button
                onClick={handleRedo}
                disabled={!canRedo || isLoading}
                className="flex-1 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors border border-zinc-200 shadow-sm disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
            >
                Redo
            </button>
            <button
                onClick={handleReset}
                disabled={isLoading}
                className="flex-1 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors border border-zinc-200 shadow-sm disabled:bg-zinc-100 disabled:cursor-not-allowed"
            >
                Start Over
            </button>
        </div>

        <div className="w-full max-w-md mx-auto bg-zinc-100 p-1.5 rounded-xl flex justify-center gap-2">
            <button
                onClick={() => setActiveTab('productPlacement')}
                className={`w-full py-2.5 px-4 rounded-lg text-sm md:text-base font-semibold transition-all duration-300 ${activeTab === 'productPlacement' ? 'bg-white shadow' : 'text-zinc-600 hover:bg-white/60'}`}
                aria-current={activeTab === 'productPlacement'}
            >
                Product Placement
            </button>
            <button
                onClick={() => setActiveTab('interiorDesign')}
                className={`w-full py-2.5 px-4 rounded-lg text-sm md:text-base font-semibold transition-all duration-300 ${activeTab === 'interiorDesign' ? 'bg-white shadow' : 'text-zinc-600 hover:bg-white/60'}`}
                aria-current={activeTab === 'interiorDesign'}
            >
                Interior Design
            </button>
        </div>

        <main className="w-full">
          {activeTab === 'productPlacement' ? renderProductPlacementContent() : <InteriorDesigner />}
        </main>
      </div>
      <DebugModal 
        isOpen={isDebugModalOpen} 
        onClose={() => setIsDebugModalOpen(false)}
        imageUrl={debugImageUrl}
        prompt={debugPrompt}
      />
    </div>
  );
};

export default App;
