declare module 'upng-js' {
  const UPNG: {
    decode: (bytes: Uint8Array) => { width: number; height: number } & Record<string, unknown>;
    toRGBA8: (png: any) => Uint8Array;
  };
  export default UPNG;
}

