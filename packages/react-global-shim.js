const React = window.__37toolbox_react || window.React;

if (!React) {
  throw new Error('React runtime is not available for external plugin');
}

export default React;
export const Fragment = React.Fragment;
export const useCallback = React.useCallback;
export const useEffect = React.useEffect;
export const useMemo = React.useMemo;
export const useRef = React.useRef;
export const useState = React.useState;
