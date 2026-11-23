/**
 * Silent visitor collector v1
 * No-permission APIs only. Requires window.__TRACK_CFG = { sb_url, sb_key }
 * Reports via Supabase RPC: track_visit / track_leave
 */
(function () {
  'use strict';

  var CFG = window.__TRACK_CFG;
  if (!CFG || !CFG.sb_url || !CFG.sb_key) return;
  if (window.__VP_TRACKED) return;
  window.__VP_TRACKED = true;

  var SENT = 'vpt_sent_v1';
  try { if (sessionStorage.getItem(SENT)) return; } catch (e) {}

  var T0 = Date.now();
  var clicks = 0, keypress = 0, deep = 0, visitId = null;

  function LS(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
      return v;
    } catch (e) { return null; }
  }
  function SS(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      sessionStorage.setItem(k, v);
      return v;
    } catch (e) { return null; }
  }
  function uid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function S(fn, fb) {
    try { var r = fn(); return r === undefined ? fb : r; } catch (e) { return fb; }
  }
  function hx(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }
  async function sha(str) {
    try {
      return hx(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))).slice(0, 32);
    } catch (e) {
      var h = 2166136261, i;
      for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ('00000000' + (h >>> 0).toString(16)).slice(-8);
    }
  }
  function canvasHash(seed) {
    try {
      var c = document.createElement('canvas');
      c.width = 320; c.height = 90;
      var x = c.getContext('2d');
      if (!x) return '';
      x.textBaseline = 'top';
      x.font = '17px "Arial"';
      x.fillStyle = '#f60';
      x.fillRect(0, 0, 110, 34);
      x.fillStyle = '#069';
      x.fillText('Cwm fjordbank glyphs vext quiz, ' + seed, 2, 16);
      x.fillStyle = 'rgba(102,204,0,0.7)';
      x.fillText('Cwm fjordbank glyphs vext quiz', 4, 50);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = 'rgb(255,0,255)';
      x.beginPath(); x.arc(52, 52, 50, 0, Math.PI * 2, true); x.closePath(); x.fill();
      x.fillStyle = 'rgb(0,255,255)';
      x.beginPath(); x.arc(104, 52, 50, 0, Math.PI * 2, true); x.closePath(); x.fill();
      return c.toDataURL();
    } catch (e) { return ''; }
  }
  function webglInfo() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return {};
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      var exts = gl.getSupportedExtensions() || [];
      return {
        v: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        r: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        ver: gl.getParameter(gl.VERSION),
        mt: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        vp: vp ? vp[0] + 'x' + vp[1] : '',
        ex: exts.length,
        exs: exts.join(',')
      };
    } catch (e) { return {}; }
  }
  async function audioInfo() {
    var out = { h: null, sr: null, bl: null, ol: null, ch: null };
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var ac = new AC();
        out.sr = ac.sampleRate;
        out.bl = ac.baseLatency === undefined ? null : Math.round(ac.baseLatency * 100000) / 100;
        out.ol = ac.outputLatency === undefined ? null : Math.round(ac.outputLatency * 100000) / 100;
        out.ch = ac.destination.maxChannelCount;
        if (ac.close) ac.close();
      }
    } catch (e) {}
    try {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (OAC) {
        var ctx = new OAC(1, 44100, 44100);
        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 1000;
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -50;
        comp.knee.value = 40;
        comp.ratio.value = 12;
        comp.attack.value = 0;
        comp.release.value = 0.25;
        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);
        var buf = await ctx.startRendering();
        var d = buf.getChannelData(0), sum = 0, i;
        for (i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
        out.h = sum.toString();
      }
    } catch (e) {}
    return out;
  }
  function fontList() {
    var probe = [
      'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria', 'Cambria Math',
      'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
      'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact', 'Lucida Console',
      'Lucida Sans Unicode', 'Malgun Gothic', 'Marlett', 'Microsoft Himalaya', 'Microsoft JhengHei',
      'Microsoft Sans Serif', 'Microsoft YaHei', 'MingLiU', 'MS Gothic', 'MV Boli',
      'Nirmala UI', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI',
      'SimSun', 'Sitka', 'Sylfaen', 'Symbol', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
      'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic',
      'Helvetica', 'Helvetica Neue', 'Menlo', 'Monaco', 'PingFang SC', 'Hiragino Sans GB',
      'Noto Sans CJK SC', 'Roboto', 'Droid Sans', 'Ubuntu', 'DejaVu Sans', 'Cantarell'
    ];
    try {
      var c = document.createElement('canvas');
      var x = c.getContext('2d');
      if (!x) return { n: 0, l: '' };
      var bases = ['monospace', 'serif', 'sans-serif'];
      var text = 'mmmmmmmmmmlli1|';
      var found = [];
      var i, j, hit, w1, w2;
      for (i = 0; i < probe.length; i++) {
        hit = false;
        for (j = 0; j < bases.length; j++) {
          x.font = '72px "' + probe[i] + '", ' + bases[j];
          w1 = x.measureText(text).width;
          x.font = '72px ' + bases[j];
          w2 = x.measureText(text).width;
          if (w1 !== w2) { hit = true; break; }
        }
        if (hit) found.push(probe[i]);
      }
      return { n: found.length, l: found.join(',') };
    } catch (e) { return { n: 0, l: '' }; }
  }
  async function voiceInfo() {
    try {
      if (!window.speechSynthesis) return { n: 0, h: '' };
      var v = speechSynthesis.getVoices();
      if (!v.length) {
        await new Promise(function (r) { setTimeout(r, 400); });
        v = speechSynthesis.getVoices();
      }
      return {
        n: v.length,
        h: v.map(function (x) { return x.name + '|' + x.lang; }).sort().join(';')
      };
    } catch (e) { return { n: 0, h: '' }; }
  }
  async function uaData() {
    if (!navigator.userAgentData) return null;
    try {
      return await navigator.userAgentData.getHighEntropyValues([
        'architecture', 'bitness', 'model', 'platformVersion',
        'uaFullVersion', 'fullVersionList', 'wow64'
      ]);
    } catch (e) { return null; }
  }
  async function deviceInfo() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return null;
    try {
      var d = await navigator.mediaDevices.enumerateDevices();
      var c = { a: 0, v: 0, o: 0 }, ids = [];
      d.forEach(function (x) {
        if (x.kind === 'audioinput') c.a++;
        else if (x.kind === 'videoinput') c.v++;
        else if (x.kind === 'audiooutput') c.o++;
        ids.push(x.kind + ':' + (x.deviceId || ''));
      });
      return { c: c, h: await sha(ids.join('|')) };
    } catch (e) { return null; }
  }
  async function codecInfo() {
    if (!navigator.mediaCapabilities) return null;
    var tests = [
      ['video/mp4; codecs="avc1.42E01E"', 'h264'],
      ['video/mp4; codecs="hvc1.1.6.L93.B0"', 'hevc'],
      ['video/mp4; codecs="av01.0.05M.08"', 'av1'],
      ['video/webm; codecs="vp9"', 'vp9'],
      ['video/webm; codecs="vp8"', 'vp8']
    ];
    var out = {}, i;
    for (i = 0; i < tests.length; i++) {
      try {
        var r = await navigator.mediaCapabilities.decodingInfo({
          type: 'file',
          video: { contentType: tests[i][0], width: 1920, height: 1080, bitrate: 4000000, framerate: 30 }
        });
        out[tests[i][1]] = r.supported ? 1 : 0;
      } catch (e) { out[tests[i][1]] = -1; }
    }
    return out;
  }
  async function emeInfo() {
    if (!navigator.requestMediaKeySystemAccess) return null;
    var out = { wv: 0, pr: 0, fp: 0 };
    var cfg = [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
    }];
    try {
      var a = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', cfg);
      var c = a.getConfiguration();
      out.wv = (c.videoCapabilities && c.videoCapabilities[0] && c.videoCapabilities[0].robustness) || 'default';
    } catch (e) {}
    try { await navigator.requestMediaKeySystemAccess('com.microsoft.playready', cfg); out.pr = 1; } catch (e) {}
    try { await navigator.requestMediaKeySystemAccess('com.apple.fps', cfg); out.fp = 1; } catch (e) {}
    return out;
  }
  async function permInfo() {
    if (!navigator.permissions) return null;
    var names = ['geolocation', 'notifications', 'camera', 'microphone'];
    var out = {}, i;
    for (i = 0; i < names.length; i++) {
      try {
        var s = await navigator.permissions.query({ name: names[i] });
        out[names[i]] = s.state;
      } catch (e) { out[names[i]] = 'x'; }
    }
    return out;
  }
  async function gpuInfo() {
    if (!navigator.gpu) return null;
    try {
      var a = await navigator.gpu.requestAdapter();
      if (!a) return { adapter: 0 };
      var info = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
      return {
        v: info.vendor || '', ar: info.architecture || '', d: info.device || '', ds: info.description || '',
        mb: a.limits ? a.limits.maxBufferSize : 0
      };
    } catch (e) { return null; }
  }
  function wasmInfo() {
    var out = {};
    try {
      out.ok = typeof WebAssembly === 'object' ? 1 : 0;
      out.simd = WebAssembly.validate(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
      ])) ? 1 : 0;
      out.thr = typeof SharedArrayBuffer === 'function' ? 1 : 0;
    } catch (e) {}
    return out;
  }
  function adblockInfo() {
    try {
      var el = document.createElement('div');
      el.className = 'ad-banner adsbox pub_300x250 pub_300x250m';
      el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px';
      document.body.appendChild(el);
      var blocked = el.offsetHeight === 0 || getComputedStyle(el).display === 'none';
      el.parentNode.removeChild(el);
      return blocked ? 1 : 0;
    } catch (e) { return null; }
  }
  function parseCand(s) {
    var m = /^candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)/.exec(s);
    return m ? { proto: m[3].toLowerCase(), ip: m[5], port: +m[6], type: m[7] } : null;
  }
  async function iceProbe(timeout) {
    if (!window.RTCPeerConnection) return { error: 'unsupported' };
    var servers = [
      'stun:stun.cloudflare.com:3478',
      'stun:stun.l.google.com:19302',
      'stun:stun.nextcloud.com:443'
    ];
    var out = { host: 0, srflx: [], relay: 0, error: null };
    var pc;
    try {
      pc = new RTCPeerConnection({ iceServers: servers.map(function (u) { return { urls: u }; }) });
    } catch (e) {
      return { error: 'ctor' };
    }
    var seen = {};
    await new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(); } }, timeout);
      pc.onicecandidate = function (ev) {
        if (done) return;
        if (!ev.candidate) { done = true; clearTimeout(timer); resolve(); return; }
        var c = parseCand(ev.candidate.candidate);
        if (!c) return;
        var k = c.type + '|' + c.ip + '|' + c.port;
        if (seen[k]) return;
        seen[k] = 1;
        if (c.type === 'host') out.host++;
        else if (c.type === 'relay') out.relay++;
        else if (c.type === 'srflx') out.srflx.push({ ip: c.ip, port: c.port });
      };
      try { pc.createDataChannel('p'); } catch (e) {}
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(function (e) {
        out.error = 'offer';
        if (!done) { done = true; clearTimeout(timer); resolve(); }
      });
    });
    try { pc.close(); } catch (e) {}
    return out;
  }
  async function httpIp() {
    var urls = [
      'https://api.ipify.org?format=json',
      'https://api64.ipify.org?format=json',
      'https://ipapi.co/json/'
    ];
    var i;
    for (i = 0; i < urls.length; i++) {
      try {
        var ac = new AbortController();
        var t = setTimeout(function () { ac.abort(); }, 2500);
        var r = await fetch(urls[i], { signal: ac.signal, cache: 'no-store', credentials: 'omit' });
        clearTimeout(t);
        var j = await r.json();
        if (j && j.ip) return j.ip;
      } catch (e) {}
    }
    return null;
  }
  function send(fn, body) {
    var h = { 'apikey': CFG.sb_key, 'Content-Type': 'application/json' };
    if (CFG.sb_key.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + CFG.sb_key;
    return fetch(CFG.sb_url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
      keepalive: true
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  async function audioSafe() {
    try { return await audioInfo(); } catch (e) { return null; }
  }
  async function build() {
    var ua = navigator.userAgent;
    var scr = S(function () {
      return {
        w: screen.width, h: screen.height,
        aw: screen.availWidth, ah: screen.availHeight,
        cd: screen.colorDepth, dpr: window.devicePixelRatio,
        orient: S(function () { return screen.orientation.type; }, ''),
        ext: S(function () { return screen.isExtended ? 1 : 0; }, null)
      };
    }, {});
    var gl = webglInfo();
    var fonts = fontList();
    var canvasData = canvasHash(fonts.n);

    var results = await Promise.all([
      audioSafe(),
      voiceInfo(),
      uaData(),
      deviceInfo(),
      codecInfo(),
      emeInfo(),
      permInfo(),
      gpuInfo(),
      iceProbe(4500),
      httpIp()
    ]);

    var audio = results[0], voices = results[1], uad = results[2], dev = results[3];
    var codecs = results[4], eme = results[5], perms = results[6], gpu = results[7];
    var ice = results[8], hip = results[9];

    var srflx = (ice && ice.srflx) || [];
    var v4 = srflx.filter(function (c) { return /^\d+\.\d+\.\d+\.\d+$/.test(c.ip); });
    var v6 = srflx.filter(function (c) { return c.ip.indexOf(':') >= 0; });

    var canvasHashV = canvasData ? await sha(canvasData) : '';
    var tz = S(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; }, '');
    var langs = S(function () { return (navigator.languages || []).join(','); }, '');
    var winInfo = {
      iw: window.innerWidth, ih: window.innerHeight,
      ow: window.outerWidth, oh: window.outerHeight
    };
    var stable = [
      ua,
      uad ? uad.architecture + uad.bitness + uad.platformVersion : '',
      scr.w + 'x' + scr.h + 'x' + scr.cd + 'x' + scr.dpr,
      S(function () { return navigator.hardwareConcurrency; }, ''),
      S(function () { return navigator.deviceMemory; }, ''),
      tz, langs,
      gl.v || '', gl.r || '', gl.mt || '',
      fonts.l
    ].join('|');
    var full = [
      stable, canvasHashV,
      audio ? String(audio.h) + '|' + audio.sr + '|' + audio.bl : '',
      voices.n, voices.h,
      dev ? JSON.stringify(dev.c) : ''
    ].join('|');
    var fp = await sha(stable);
    var fp2 = await sha(full);
    var ip = hip || null;
    var stun4 = v4.length ? v4[0].ip : null;
    var stun6 = v6.length ? v6[0].ip : null;

    return {
      v: 1,
      vid: LS('vp_visitor_id') || LS('vp_visitor_id', uid()),
      sid: SS('vp_session_id') || SS('vp_session_id', uid()),
      ts: Date.now(),
      ua: ua,
      uap: S(function () { return navigator.platform; }, ''),
      uam: S(function () { return navigator.userAgentData ? navigator.userAgentData.mobile : null; }, null),
      arch: uad ? uad.architecture : null,
      bit: uad ? uad.bitness : null,
      model: uad ? uad.model : null,
      pver: uad ? uad.platformVersion : null,
      uafull: uad ? uad.uaFullVersion : null,
      tz: tz,
      tzo: S(function () { return new Date().getTimezoneOffset(); }, null),
      lang: S(function () { return navigator.language; }, ''),
      langs: langs,
      scr: scr,
      win: winInfo,
      cores: S(function () { return navigator.hardwareConcurrency; }, null),
      mem: S(function () { return navigator.deviceMemory; }, null),
      mtp: S(function () { return navigator.maxTouchPoints; }, 0),
      pdf: S(function () { return navigator.pdfViewerEnabled ? 1 : 0; }, null),
      wd: S(function () { return navigator.webdriver ? 1 : 0; }, 0),
      dnt: S(function () { return navigator.doNotTrack; }, null),
      gl: { v: gl.v, r: gl.r, mt: gl.mt, ex: gl.ex, exs: gl.exs },
      canvas: canvasHashV,
      audio: audio,
      fonts: fonts,
      voices: { n: voices.n, h: await sha(voices.h) },
      codecs: codecs,
      eme: eme,
      dev: dev,
      wasm: wasmInfo(),
      gpu: gpu,
      perm: perms,
      adb: adblockInfo(),
      ip: ip,
      srv: CFG.srv_ip || null,
      stun4: stun4,
      stun6: stun6,
      stunport: v4.length ? v4[0].port : null,
      leaked: !!(stun4 && ip && ip.indexOf(':') < 0 && stun4 !== ip),
      iceErr: ice ? ice.error : null,
      host: ice ? ice.host : 0,
      relay: ice ? ice.relay : 0,
      fp: fp,
      fp2: fp2,
      ipua: (ip || '') + '|' + ua,
      vis: document.visibilityState
    };
  }
  function bindBehavior() {
    try {
      window.addEventListener('click', function () { clicks++; }, true);
      window.addEventListener('keydown', function () { keypress++; }, true);
      window.addEventListener('scroll', function () {
        var d = document.documentElement;
        if (!d || !d.scrollHeight) return;
        var p = (window.scrollY + window.innerHeight) / d.scrollHeight;
        if (p > deep) deep = p > 1 ? 1 : p;
      }, { passive: true });
      window.addEventListener('pagehide', function () {
        if (!visitId) return;
        send('track_leave', {
          p: {
            visit: visitId,
            dur: Date.now() - T0,
            clicks: clicks,
            keys: keypress,
            scroll: Math.round((deep > 1 ? 1 : deep) * 100) / 100
          }
        });
      });
    } catch (e) {}
  }
  async function run() {
    if (document.visibilityState === 'hidden') {
      await new Promise(function (r) {
        var h = function () {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', h);
            r();
          }
        };
        document.addEventListener('visibilitychange', h);
        setTimeout(r, 8000);
      });
    }
    bindBehavior();
    var payload;
    try { payload = await build(); } catch (e) { return; }
    try { SS(SENT, '1'); } catch (e) {}
    var res = await send('track_visit', { p: payload });
    if (res && res.visit) visitId = res.visit;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
