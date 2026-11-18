import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const safe = text => text.replace(/<\/script/gi, '<\\/script');
const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export async function resources() {
  const manifest = JSON.parse(read('src/mnaddon.json'));
  const result = await build({ entryPoints: ['web/src/settings.js'], bundle: true, write: false, format: 'iife', target: 'safari15', charset: 'utf8', legalComments: 'none' });
  const settingsHTML = read('web/src/settings.html').replaceAll('__MNP_ABOUT_NAME__', escapeHTML(manifest.title)).replaceAll('__MNP_ABOUT_VERSION__', escapeHTML(manifest.version)).replaceAll('__MNP_ABOUT_AUTHOR__', escapeHTML(manifest.author)).replace('<!-- MNP_ABOUT_ICON -->', () => '<img src="data:image/png;base64,' + readFileSync('assets/icon.png').toString('base64') + '" alt="" width="64" height="64">').replace('/* MNP_STYLE */', () => read('web/src/settings.css') + '\n' + read('web/src/settings-panel.css')).replace('/* MNP_APP */', () => safe(read('src/MNPPetPackModel.js') + '\n' + result.outputFiles[0].text));
  const focus = await build({ entryPoints: ['web/src/focus.js'], bundle: true, write: false, format: 'iife', target: 'safari15', charset: 'utf8', legalComments: 'none' });
  const focusHTML = read('web/src/focus.html').replace('/* MNP_STYLE */', () => read('web/src/settings.css')).replace('/* MNP_APP */', () => safe(focus.outputFiles[0].text));
  const petBubbleHTML = read('web/src/pet-bubble/index.html').replace('/* MNP_UPSTREAM_STYLE */', () => read('web/src/pet-bubble/upstream.css')).replace('<!-- MNP_UPSTREAM_SVG -->', () => read('web/src/pet-bubble/upstream.svg')).replace('/* MNP_BUBBLE_APP */', () => safe(read('web/src/pet-bubble/player.js')));
  return { settingsHTML, focusHTML, petBubbleHTML, petMotionHTML: read('web/src/pet-motion/index.html'), petMotionPlayer: read('web/src/pet-motion/player.js') };
}
