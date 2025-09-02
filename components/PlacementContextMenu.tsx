/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';

interface PlacementContextMenuProps {
  position: { x: number; y: number };
  onPlaceOnSurface: () => void;
  onPlaceAgainstWall: () => void;
  onChangeColor: () => void;
  onChangeTexture: () => void;
  onClose: () => void;
  isProductSelected: boolean;
}

const MenuItem: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled = false, children }) => (
  <li>
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors disabled:text-zinc-400 disabled:bg-white disabled:cursor-not-allowed"
    >
      {children}
    </button>
  </li>
);

const PlacementContextMenu: React.FC<PlacementContextMenuProps> = ({
  position,
  onPlaceOnSurface,
  onPlaceAgainstWall,
  onChangeColor,
  onChangeTexture,
  onClose,
  isProductSelected
}) => {
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: position.y,
    left: position.x + 15, // Offset to the right of the cursor
    zIndex: 50,
  };

  return (
    <>
      {/* Backdrop to close on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      <div
        style={menuStyle}
        className="bg-white rounded-lg shadow-xl border border-zinc-200 w-56 animate-fade-in"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="menu-button"
      >
        <ul className="py-1 divide-y divide-zinc-100">
          <MenuItem onClick={onPlaceOnSurface} disabled={!isProductSelected}>Place Product Here</MenuItem>
          <MenuItem onClick={onPlaceAgainstWall} disabled={!isProductSelected}>Place Product Against Nearest Wall</MenuItem>
          <MenuItem onClick={onChangeColor}>Change Color of this Surface...</MenuItem>
          <MenuItem onClick={onChangeTexture}>Change Texture of this Surface...</MenuItem>
        </ul>
      </div>
    </>
  );
};

export default PlacementContextMenu;
