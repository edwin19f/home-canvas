/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';

interface SurfaceModificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  type: 'color' | 'texture';
}

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const SurfaceModificationModal: React.FC<SurfaceModificationModalProps> = ({ isOpen, onClose, onSubmit, type }) => {
  const [inputValue, setInputValue] = useState('');

  // Reset input when the modal opens for a new modification
  useEffect(() => {
    if (isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };
  
  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (inputValue.trim()) {
        onSubmit(inputValue.trim());
      }
  }

  const title = type === 'color' ? 'Change Surface Color' : 'Change Surface Texture';
  const placeholder = type === 'color' 
    ? 'e.g., a warm, matte beige' 
    : 'e.g., light oak wood planks';
  const label = type === 'color' ? 'New Color Description' : 'New Texture Description';

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 md:p-8 relative transform transition-all"
        onClick={handleModalContentClick}
        role="document"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-800 transition-colors"
          aria-label="Close modal"
        >
          <CloseIcon />
        </button>
        <div className="text-left">
          <h2 className="text-2xl font-extrabold mb-4 text-zinc-800">{title}</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="modification-input" className="block text-sm font-medium text-zinc-700 mb-2">
                {label}
            </label>
            <input
                id="modification-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                className="w-full p-2 bg-white border border-zinc-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                autoFocus
            />
            <button
                type="submit"
                disabled={!inputValue.trim()}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
                Generate
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SurfaceModificationModal;
