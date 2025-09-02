/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback } from 'react';
import ImageUploader from './ImageUploader';
import Spinner from './Spinner';
import { generateInteriorDesign } from '../services/geminiService';

const InteriorDesigner: React.FC = () => {
  const [roomImage, setRoomImage] = useState<File | null>(null);
  const [designPrompt, setDesignPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);

  const roomImageUrl = roomImage ? URL.createObjectURL(roomImage) : null;
  const displayImageUrl = resultImageUrl || roomImageUrl;

  const handleImageUpload = useCallback((file: File) => {
    setError(null);
    setResultImageUrl(null);
    setDesignPrompt('');
    setRoomImage(file);
  }, []);

  const handleReset = useCallback(() => {
    setRoomImage(null);
    setResultImageUrl(null);
    setError(null);
    setIsLoading(false);
    setDesignPrompt('');
  }, []);
  
  const handleGenerate = async () => {
    if (!roomImage || !designPrompt.trim()) {
      setError('Please provide a room image and a design instruction.');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const generatedImageUrl = await generateInteriorDesign(roomImage, designPrompt);
      setResultImageUrl(generatedImageUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to generate the design. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!roomImage) {
    return (
      <div className="w-full max-w-3xl mx-auto animate-fade-in text-center">
        <h2 className="text-2xl font-extrabold mb-5 text-zinc-800">Upload Your Room</h2>
        <ImageUploader 
          id="room-uploader"
          onFileSelect={handleImageUpload}
          imageUrl={null}
        />
        <p className="text-zinc-500 mt-6 animate-fade-in">
          Upload a photo of your space to start designing.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        {/* Image Column */}
        <div className="w-full aspect-video bg-zinc-100 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm">
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center animate-fade-in">
              <Spinner />
              <p className="text-xl mt-4 text-zinc-600">Generating your new design...</p>
            </div>
          )}
          <img src={displayImageUrl!} alt="Your room" className="w-full h-full object-contain" />
        </div>

        {/* Controls Column */}
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="design-prompt" className="block text-lg font-bold text-zinc-800 mb-2">
              Design Instructions
            </label>
            <textarea
              id="design-prompt"
              rows={4}
              className="w-full p-3 border-2 border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="e.g., Make the walls sage green and add a mid-century modern armchair."
              value={designPrompt}
              onChange={(e) => setDesignPrompt(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {error && (
             <div className="text-center animate-fade-in bg-red-50 border border-red-200 p-4 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleGenerate}
              disabled={isLoading || !designPrompt.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors disabled:bg-zinc-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? 'Designing...' : 'Generate Design'}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="w-full sm:w-auto bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold py-3 px-6 rounded-lg text-lg transition-colors"
            >
              Start Over
            </button>
          </div>
          
          <p className="text-xs text-zinc-500 mt-2">
            Tip: Be descriptive! Mention styles (e.g., "minimalist", "bohemian"), colors, furniture, and materials for best results.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InteriorDesigner;
