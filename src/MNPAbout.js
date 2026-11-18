var MNPAbout = (function () {
  // 插件说明与桌宠制作的网址集中维护，点击后交给系统打开网页。
  var links = {
    guide: 'https://bbs.marginnote.com.cn/t/topic/68947',
    maker: 'https://qiaomu-joe-garden.pages.dev/'
  };
  function open(target) {
    if (typeof target !== 'string' || !Object.prototype.hasOwnProperty.call(links, target)) throw new Error('不支持的插件链接');
    var app = MNPNative.app();
    var address = typeof NSURL === 'undefined' || typeof NSURL.URLWithString !== 'function' ? null : NSURL.URLWithString(links[target]);
    if (!address || typeof app.openURL !== 'function') throw new Error('当前无法打开网页，请稍后重试');
    app.openURL(address);
    return true;
  }
  return { open: open };
})();
