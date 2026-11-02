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

  function embed(id) {
    var wrap = document.createElement('div');
    wrap.className = 'embed';
    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id;
    frame.title = 'YouTube video';
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    frame.allowFullscreen = true;
    wrap.appendChild(frame);
    return wrap;
  }

  // Skips whitespace-only text between a link and its neighbours.
  function sibling(node, dir) {
    var n = node[dir];
    while (n && n.nodeType === 3 && !n.textContent.trim()) n = n[dir];
    return n;
  }
  function isEdge(n) { return !n || n.nodeName === 'BR'; }

  // A YouTube link on a line of its own (alone in its paragraph, or between line breaks)
  // becomes an embed, splitting the paragraph around it.
  document.querySelectorAll('.prose p > a').forEach(function (a) {
    var id = youtubeId(a.href);
    if (!id || !/^[\w-]{6,}$/.test(id)) return;
    var prev = sibling(a, 'previousSibling'), next = sibling(a, 'nextSibling');
    if (!isEdge(prev) || !isEdge(next)) return;
    var p = a.parentNode;
    var after = p.cloneNode(false);
    while (a.nextSibling) after.appendChild(a.nextSibling);
    if (prev) p.removeChild(prev);
    if (next) after.removeChild(next);
    a.remove();
    p.after(embed(id));
    if (after.textContent.trim() || after.querySelector('img, video')) p.nextSibling.after(after);
    if (!p.textContent.trim() && !p.querySelector('img, video')) p.remove();
  });
})();
