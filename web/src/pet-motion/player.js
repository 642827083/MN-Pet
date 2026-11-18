(function () {
  let token = 0, state = 'stopped', image = document.getElementById('animation'), pending = null, currentURL = '';
  function cancelPending() {
    if (!pending) return;
    pending.image.onload = null; pending.image.onerror = null; pending.image.removeAttribute('src'); URL.revokeObjectURL(pending.url); pending = null;
  }
  window.MNPPetAnimation = {
    play(asset, nextToken) {
      if (!asset || typeof asset.base64 !== 'string' || asset.base64.length > 2796204 || !Number.isSafeInteger(nextToken) || nextToken < 0) return 'invalid';
      cancelPending(); token = nextToken; state = 'loading';
      let url;
      try {
        const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
      } catch { state = 'failed'; return this.status(); }
      const next = new Image(), current = token;
      pending = { image: next, url };
      next.alt = ''; next.id = 'animation';
      next.onload = () => { if (token !== current) return; pending = null; image.replaceWith(next); image = next; if (currentURL) URL.revokeObjectURL(currentURL); currentURL = url; state = 'ready'; };
      next.onerror = () => { if (token === current) { pending = null; URL.revokeObjectURL(url); state = 'failed'; } };
      // 每次点播新建图片 URL，只接收已校验的素材字节。
      next.src = url;
      return this.status();
    },
    status() { return `${state}:${token}`; },
    stop() { token++; state = 'stopped'; cancelPending(); image.removeAttribute('src'); if (currentURL) URL.revokeObjectURL(currentURL); currentURL = ''; }
  };
})();
