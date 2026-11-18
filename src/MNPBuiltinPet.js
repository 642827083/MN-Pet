var MNPBuiltinPet = (function () {
  var revision = 'DSniang1-256-7d933f6b48a603c8';
  function path(s) {
    if (!s.mainPath) throw new Error('无法定位自带桌宠资源');
    return s.mainPath.replace(/\/$/, '') + '/web-dist/pet-builtin/DSniang1.png';
  }
  function image(s) {
    if (typeof UIImage === 'undefined' || typeof UIImage.imageWithContentsOfFile !== 'function') throw new Error('当前 MN 缺少图片加载接口');
    var result = UIImage.imageWithContentsOfFile(path(s));
    if (!result) throw new Error('自带桌宠资源读取失败，请重新安装测试包');
    return result;
  }
  function base64(s) {
    if (typeof NSFileManager === 'undefined') throw new Error('当前 MN 缺少桌宠预览读取接口');
    var data = NSFileManager.defaultManager().contentsAtPath(path(s));
    var result = data && (typeof data.base64Encoding === 'function' ? data.base64Encoding() : data.base64Encoding);
    if (typeof result !== 'string' || !result) throw new Error('自带桌宠预览读取失败');
    return result;
  }
  return { image: image, base64: base64, snapshot: function () { return { name: '哦鲸鲸', revision: revision }; } };
})();
