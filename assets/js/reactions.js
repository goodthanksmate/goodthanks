// Emoji reaction buttons under blog posts. Counts come from the Cloudflare worker in
// reactions-worker/, which also remembers which reactions belong to this browser.
(function () {
  var box = document.querySelector('.reactions');
  if (!box) return;
  var api = box.dataset.api + '?post=' + encodeURIComponent(box.dataset.post);

  // Anonymous random ID so the server knows which reactions are this browser's
  var client;
  try { client = localStorage.getItem('reactions-client'); } catch (e) {}
  if (!client) {
    client = crypto.randomUUID();
    try { localStorage.setItem('reactions-client', client); } catch (e) {}
  }

  var state = { counts: {}, mine: [] };
  var latest = 0;
  var buttons = [].slice.call(box.querySelectorAll('button'));

  function paint() {
    buttons.forEach(function (b) {
      var r = b.dataset.reaction, on = state.mine.indexOf(r) !== -1;
      b.querySelector('.count').textContent = state.counts[r] || '';
      b.classList.toggle('mine', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // Responses can arrive out of order when clicking fast, so only the newest one counts
  function apply(seq) {
    return function (s) {
      if (seq === latest && s && s.counts) { state = s; paint(); }
    };
  }

  fetch(api + '&client=' + client)
    .then(function (r) { return r.json(); })
    .then(function (s) { apply(latest)(s); box.hidden = false; })
    .catch(function () {});

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var r = b.dataset.reaction, had = state.mine.indexOf(r) !== -1;

      // One reaction per browser: show the switch straight away; the server's answer then replaces it
      state.mine.forEach(function (old) { state.counts[old] = Math.max(0, (state.counts[old] || 0) - 1); });
      state.mine = had ? [] : [r];
      if (!had) state.counts[r] = (state.counts[r] || 0) + 1;
      paint();

      var seq = ++latest;
      fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: client, reaction: r })
      })
        .then(function (res) { return res.json(); })
        .then(apply(seq))
        .catch(function () {});
    });
  });
})();
