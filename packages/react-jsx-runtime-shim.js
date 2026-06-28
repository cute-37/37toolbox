import React from './react-global-shim.js';

export const Fragment = React.Fragment;

export function jsx(type, props, key) {
  const nextProps = props ? { ...props } : {};
  if (key !== undefined) {
    nextProps.key = key;
  }
  return React.createElement(type, nextProps);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
