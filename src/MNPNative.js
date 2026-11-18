var MNPNative = (function () {
  function value(object, key) {
    if (!object) return undefined;
    var item = object[key];
    if (item === undefined && typeof object.objectForKey === 'function') item = object.objectForKey(key);
    return typeof item === 'function' ? item.call(object) : item;
  }
  function items(list) {
    if (!list) return [];
    if (Array.isArray(list)) return list.slice();
    var count = Number(value(list, 'count'));
    if (!Number.isSafeInteger(count) || count < 0 || count > 10000 || typeof list.objectAtIndex !== 'function') throw new Error('无法读取当前卡片选择');
    var result = [];
    for (var i = 0; i < count; i++) result.push(list.objectAtIndex(i));
    return result;
  }
  function app() {
    if (typeof Application === 'undefined' || typeof Application.sharedInstance !== 'function') throw new Error('当前环境缺少 MN 原生接口');
    return Application.sharedInstance();
  }
  function study(controller) { return app().studyController(controller.addon.window); }
  function hud(controller, message) {
    app().showHUD(String(message), controller.addon.window, 3);
  }
  function preference(key, fallback) {
    if (typeof NSUserDefaults === 'undefined') return fallback;
    var result = NSUserDefaults.standardUserDefaults().objectForKey('cn.marginnote.mn-pet.' + key);
    return result === null || result === undefined ? fallback : result;
  }
  function save(key, result) {
    if (typeof NSUserDefaults === 'undefined') throw new Error('当前 MN 缺少设置保存接口');
    if (typeof result !== 'string' && typeof result !== 'boolean' && !(typeof result === 'number' && Number.isFinite(result))) throw new Error('设置值无效');
    NSUserDefaults.standardUserDefaults().setObjectForKey(result, 'cn.marginnote.mn-pet.' + key);
  }
  function script(value) { return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function token() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2); }
  function evaluate(view, code, seconds) {
    return new Promise(function (resolve, reject) {
      var settled = false, timer;
      function finish(value, error) {
        if (settled) return; settled = true;
        if (timer) timer.invalidate();
        if (error) reject(error); else resolve(value);
      }
      try {
        if (!view || typeof view.evaluateJavaScript !== 'function') throw new Error('网页暂时不可用');
        timer = NSTimer.scheduledTimerWithTimeInterval(seconds || 8, false, function () { finish(null, new Error('网页响应超时，请检查页面后重试')); });
        view.evaluateJavaScript(code, function (result) { finish(result); });
      } catch (error) { finish(null, error); }
    });
  }
  function delay(seconds) { return new Promise(function (resolve) { NSTimer.scheduledTimerWithTimeInterval(seconds, false, resolve); }); }
  function address(request) { return String(value(value(request, 'URL'), 'absoluteString') || ''); }
  return { value: value, items: items, app: app, study: study, hud: hud, preference: preference, save: save, script: script, token: token, evaluate: evaluate, delay: delay, address: address };
})();
