// Turns videos in posts into players: an "image" that's really a video file
// (mp4/webm/mov) becomes a <video>, and a YouTube link on its own line becomes an embed.
(function () {
  var VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

  document.querySelectorAll('.prose img').forEach(function (img) {
    var src = img.getAttribute('src') || '';
    if (!VIDEO.test(src)) return;
    var video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    if (img.alt && !VIDEO.test(img.alt)) video.setAttribute('aria-label', img.alt);
    img.replaceWith(video);
  });

  function youtubeId(href) {
    try {
      var u = new URL(href);
      var host = u.hostname.replace(/^(www|m)\./, '');
      if (host === 'youtu.be') return u.pathname.slice(1);
      if (host === 'youtube.com') {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        var m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
        if (m) return m[2];
      }
    } catch (e) {}
    return null;
  }

  document.querySelectorAll('.prose p').forEach(function (p) {
    var a = p.querySelector('a');
    if (!a || p.children.length !== 1 || p.textContent.trim() !== a.textContent.trim()) return;
    var id = youtubeId(a.href);
    if (!id || !/^[\w-]{6,}$/.test(id)) return;
    var wrap = document.createElement('div');
    wrap.className = 'embed';
    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id;
    frame.title = 'YouTube video';
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    frame.allowFullscreen = true;
    wrap.appendChild(frame);
    p.replaceWith(wrap);
  });
})();
