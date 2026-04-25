export const ASSET_MANIFEST = {
  sky:               'assets/sky.png',
  dirt:              'assets/dirt.png',
  'elevator-bank':   'assets/elevator-bank.png',
  'lobby-floor':     'assets/lobby-floor.png',
  basement:          'assets/basement.png',
  'office-1':        'assets/office-1.png',
  'office-2':        'assets/office-2.png',
  'office-3':        'assets/office-3.png',
  player:            'assets/player.png',
  'elevator-button':        'assets/elevator-button.png',
  'floor-indicator':        'assets/floor-indicator.png',
  'elevator-current-floor': 'assets/elevator-current-floor.png',
};

export async function loadAssets() {
  const entries = await Promise.all(
    Object.entries(ASSET_MANIFEST).map(async ([key, path]) => {
      const img = await loadImage(path);
      return [key, img];
    })
  );
  return Object.fromEntries(entries);
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load asset: ${path}`));
    img.src = path;
  });
}
