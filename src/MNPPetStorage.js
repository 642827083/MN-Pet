var MNPPetStorage = (function () {
  var names = ['pet-pack.json', 'custom-pet.json', 'pet-pack-poster.png', 'custom-pet-image.png'];
  function path(store, name) {
    if (names.indexOf(name) < 0) throw new Error('不支持的桌宠文件');
    return store.root + '/' + name;
  }
  function mkdir(store) {
    if (!store.manager.fileExistsAtPath(store.root) && !store.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(store.root, true, null)) throw new Error('无法创建 MN-Pet 桌宠目录');
  }
  function open() {
    var app = Application.sharedInstance();
    if (!app || typeof app.documentPath !== 'string' || !app.documentPath || typeof NSFileManager === 'undefined' || !NSFileManager.defaultManager || typeof NSJSONSerialization === 'undefined' || typeof NSData === 'undefined') throw new Error('当前 MN 缺少桌宠文件存储接口');
    return { root: app.documentPath.replace(/\/$/, '') + '/MN-Pet', manager: NSFileManager.defaultManager() };
  }
  function erase(store, name, cache, record) {
    var target = path(store, name), cached = path(store, cache);
    // 清空派生缓存，再原子替换主记录；失败时原角色仍可由主记录恢复。
    if (store.manager.fileExistsAtPath(cached)) {
      var empty = NSData.dataWithStringEncoding('', 5);
      if (!empty || !empty.writeToFileAtomically(cached, true)) throw new Error('桌宠缓存清理失败，已保留原角色');
    }
    mkdir(store);
    var data = NSJSONSerialization.dataWithJSONObjectOptions(record, 0);
    if (!data || !data.writeToFileAtomically(target, true)) throw new Error('桌宠删除失败，已保留原角色');
    // 保留不含图片的小型空记录，避免旧窗口让已删除角色重新出现。
  }
  return { open: open, erase: erase };
})();
