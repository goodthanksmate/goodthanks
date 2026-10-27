// Emoji reaction buttons under blog posts. Counts come from the Cloudflare worker in
// reactions-worker/; which buttons this visitor has pressed is remembered in their browser.
(function () {
  var box = document.querySelector('.reactions');
  if (!box) return;
  var api = box.dataset.api, post = box.dataset.post;
  var storageKey = 'reacted:' + post;
  var mine = {}, counts = {}, busy = {};
  try { mine = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (e) {}

  var buttons = [].slice.call(box.querySelectorAll('button'));

  function paint() {
    buttons.forEach(function (b) {
      var r = b.dataset.reaction;
      b.querySelector('.count').textContent = counts[r] || '';
      b.classList.toggle('mine', !!mine[r]);
      b.setAttribute('aria-pressed', mine[r] ? 'true' : 'false');
    });
  }

  fetch(api + '?post=' + encodeURIComponent(post))
    .then(function (r) { return r.json(); })
    .then(function (c) { counts = c; paint(); box.hidden = false; })
    .catch(function () {});

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var r = b.dataset.reaction;
      if (busy[r]) return;
      busy[r] = true;
      var delta = mine[r] ? -1 : 1;

      // Update straight away, then settle on whatever the server says
      if (delta > 0) mine[r] = true; else delete mine[r];
      counts[r] = Math.max(0, (counts[r] || 0) + delta);
      paint();
      try { localStorage.setItem(storageKey, JSON.stringify(mine)); } catch (e) {}

      fetch(api + '?post=' + encodeURIComponent(post), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: r, delta: delta })
      })
        .then(function (res) { return res.json(); })
        .then(function (c) { if (!c.error) { counts = c; paint(); } })
        .catch(function () {})
        .then(function () { busy[r] = false; });
    });
  });
})();
