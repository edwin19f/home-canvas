/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';

interface PlacementContextMenuProps {
  position: { x: number; y: number };
  onPlaceProduct: () => void;
  onChangeColor: () => void;
  onChangeTexture: () => void;
  onOther: () => void;
  onClose: () => void;
}

const MenuItem: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <li>
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
    >
      {children}
    </button>
  </li>
);

const PlacementContextMenu: React.FC<PlacementContextMenuProps> = ({
  position,
  onPlaceProduct,
  onChangeColor,
  onChangeTexture,
  onOther,
  onClose,
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
        className="bg-white rounded-lg shadow-xl border border-zinc-200 w-48 animate-fade-in"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="menu-button"
      >
        <ul className="py-1">
          <MenuItem onClick={onPlaceProduct}>Place Product</MenuItem>
          <MenuItem onClick={onChangeColor}>Change Color</MenuItem>
          <MenuItem onClick={onChangeTexture}>Change Texture</MenuItem>
          <MenuItem onClick={onOther}>Others</MenuItem>
        </ul>
      </div>
    </>
  );
};

export default PlacementContextMenu;
