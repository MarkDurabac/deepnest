interface ThumbnailJob {
  id: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  elements: string[];
}

interface ThumbnailResult {
  id: number;
  svg: string;
}

self.onmessage = (event: MessageEvent<ThumbnailJob>) => {
  const { id, bounds, elements } = event.data;
  const pad = 5;
  const viewBox = `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`;
  const svg = `<svg width="${bounds.width + 10}px" height="${bounds.height + 10}px" viewBox="${viewBox}">${elements.join("")}</svg>`;

  const payload: ThumbnailResult = { id, svg };
  self.postMessage(payload);
};

export {};
