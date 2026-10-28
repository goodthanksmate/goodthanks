// Emoji reaction buttons under blog posts, plus who reacted with what. Only guests (people who
// signed the guestbook) can react; anyone else gets a sign form first, then their reaction goes through.
(function () {
  var box = document.querySelector('.reactions');
  var g = window.goodthanks;
  if (!box || !g) return;
  var api = g.api + '?post=' + encodeURIComponent(box.dataset.post);
  var signBox = document.querySelector('.react-sign');
  var whoList = document.querySelector('.reacted-by');

  var state = { counts: {}, mine: [], who: [], guest: false };
  var latest = 0, pending = null;
  var buttons = [].slice.call(box.querySelectorAll('button'));
  var emojiFor = {};
  buttons.forEach(function (b) { emojiFor[b.dataset.reaction] = b.querySelector('.emoji').textContent; });

  function paint() {
    buttons.forEach(function (b) {
      var r = b.dataset.reaction, on = state.mine.indexOf(r) !== -1;
      b.querySelector('.count').textContent = state.counts[r] || '';
      b.classList.toggle('mine', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    whoList.textContent = '';
    state.who.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w.emoji + ' ' + w.name + ' ' + emojiFor[w.reaction];
      li.title = 'Guest #' + w.number;
      whoList.appendChild(li);
    });
    whoList.hidden = !state.who.length;
  }

  // Responses can arrive out of order when clicking fast, so only the newest one counts
  function apply(seq) {
    return function (s) {
      if (seq === latest && s && s.counts) { state = s; paint(); }
    };
  }

  function react(r) {
    var had = state.mine.indexOf(r) !== -1;
    // One reaction per guest: show the switch straight away; the server's answer then replaces it
    state.mine.forEach(function (old) { state.counts[old] = Math.max(0, (state.counts[old] || 0) - 1); });
    state.mine = had ? [] : [r];
    if (!had) state.counts[r] = (state.counts[r] || 0) + 1;
    paint();

    var seq = ++latest;
    fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: g.client, reaction: r })
    })
      .then(function (res) { return res.json(); })
      .then(apply(seq))
      .catch(function () {});
  }

  fetch(api + '&client=' + g.client)
    .then(function (r) { return r.json(); })
    .then(function (s) { apply(latest)(s); box.hidden = false; })
    .catch(function () {});

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.guest) return react(b.dataset.reaction);
      pending = b.dataset.reaction;
      signBox.hidden = false;
      signBox.querySelector('input[name=name]').focus();
    });
  });

  g.bindForm(signBox.querySelector('.sign-form'), function () {
    state.guest = true;
    signBox.hidden = true;
    if (pending) react(pending);
    pending = null;
  });
})();
