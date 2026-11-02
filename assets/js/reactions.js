// Emoji reaction buttons under blog posts. The fixed reactions are always shown; the ➕ button opens
// a picker for any other emoji, and those get their own button once someone uses them. Hovering a
// reaction (or long-pressing on touch screens) lists who used it. Only guests (people who signed the
// guestbook) can react; anyone else gets a sign form first, then their reaction goes through.
(function () {
  var box = document.querySelector('.reactions');
  var g = window.goodthanks;
  if (!box || !g) return;
  var api = g.api + '?post=' + encodeURIComponent(box.dataset.post);
  var signBox = document.querySelector('.react-sign');
  var addButton = box.querySelector('.add-reaction');
  var pickerBox = document.querySelector('.emoji-pop');
  var PICKER = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@1.29.1/index.js';
  var PICKER_DATA = 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1.8.0/en/emojibase/data.json';

  var state = { counts: {}, mine: [], who: [], guest: false };
  var latest = 0, pending = null;
  var fixed = [].slice.call(box.querySelectorAll('button[data-reaction]'));
  var buttons = fixed.slice();

  // Picking an emoji that's already a fixed reaction (like 👍) uses the fixed one
  var fixedByEmoji = {};
  fixed.forEach(function (b) { fixedByEmoji[b.querySelector('.emoji').textContent] = b.dataset.reaction; });

  function makeButton(emoji) {
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.reaction = emoji;
    b.title = emoji;
    b.setAttribute('aria-label', emoji);
    b.innerHTML = '<span class="emoji"></span><span class="count"></span><span class="who" aria-hidden="true"></span>';
    b.querySelector('.emoji').textContent = emoji;
    bind(b);
    buttons.push(b);
    return b;
  }

  // Custom emoji buttons come and go with their counts; fixed ones always stay
  function syncCustomButtons() {
    Object.keys(state.counts).forEach(function (r) {
      if (state.counts[r] > 0 && !buttons.some(function (b) { return b.dataset.reaction === r; })) makeButton(r);
    });
    buttons = buttons.filter(function (b) {
      var keep = fixed.indexOf(b) !== -1 || state.counts[b.dataset.reaction] > 0;
      if (!keep) b.remove();
      return keep;
    });
  }

  function paint() {
    syncCustomButtons();
    sortButtons();
    buttons.forEach(function (b) {
      var r = b.dataset.reaction, on = state.mine.indexOf(r) !== -1;
      b.querySelector('.count').textContent = state.counts[r] || '';
      b.classList.toggle('mine', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');

      // Hover list of everyone who used this reaction
      var list = b.querySelector('.who');
      list.textContent = '';
      state.who.forEach(function (w) {
        if (w.reaction !== r) return;
        var line = document.createElement('span');
        line.textContent = w.emoji + ' ' + w.name;
        list.appendChild(line);
      });
    });
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

  // Guests react straight away; anyone else signs the guestbook first
  function choose(r) {
    if (state.guest) return react(r);
    pending = r;
    signBox.hidden = false;
    signBox.querySelector('input[name=name]').focus();
  }

  // Most-used reactions first, ties in the usual order, with ➕ always last
  function sortButtons() {
    buttons
      .map(function (b, i) { return { b: b, i: i, n: state.counts[b.dataset.reaction] || 0 }; })
      .sort(function (x, y) { return y.n - x.n || x.i - y.i; })
      .forEach(function (x) { box.appendChild(x.b); });
    box.appendChild(addButton);
  }

  fetch(api + '&client=' + g.client)
    .then(function (r) { return r.json(); })
    .then(function (s) { apply(latest)(s); box.hidden = false; })
    .catch(function () {});

  // Long-press on touch screens shows the who-used-it list instead of reacting
  var pressTimer = null, longPressed = false, startX = 0, startY = 0;
  function hideWho() { buttons.forEach(function (b) { b.classList.remove('show-who'); }); }

  // Keep the who-used-it popup on screen: nudge it sideways if it would poke off an edge
  function placeWho(b) {
    var who = b.querySelector('.who');
    who.style.setProperty('--nudge', '0px');
    var rect = who.getBoundingClientRect(), margin = 8, nudge = 0;
    if (rect.left < margin) nudge = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) nudge = window.innerWidth - margin - rect.right;
    who.style.setProperty('--nudge', nudge + 'px');
  }
  document.addEventListener('pointerdown', function (e) {
    if (!box.contains(e.target)) hideWho();
    if (!pickerBox.hidden && !pickerBox.contains(e.target) && !addButton.contains(e.target)) pickerBox.hidden = true;
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pickerBox.hidden = true; });

  function bind(b) {
    b.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch') return;
      longPressed = false;
      startX = e.clientX; startY = e.clientY;
      pressTimer = setTimeout(function () {
        longPressed = true;
        hideWho();
        b.classList.add('show-who');
        placeWho(b);
      }, 450);
    });
    b.addEventListener('pointermove', function (e) {
      if (pressTimer && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 10) { clearTimeout(pressTimer); pressTimer = null; }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      b.addEventListener(type, function () { clearTimeout(pressTimer); pressTimer = null; });
    });
    b.addEventListener('contextmenu', function (e) { if (longPressed) e.preventDefault(); });
    b.addEventListener('mouseenter', function () { placeWho(b); });
    b.addEventListener('focus', function () { placeWho(b); });

    b.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      hideWho();
      choose(b.dataset.reaction);
    });
  }
  fixed.forEach(bind);

  // The ➕ button: loads the emoji picker the first time it's needed
  var pickerReady = null;
  addButton.addEventListener('click', function () {
    if (!pickerBox.hidden) { pickerBox.hidden = true; return; }
    pickerReady = pickerReady || import(PICKER).then(function () {
      var picker = document.createElement('emoji-picker');
      picker.className = 'dark';
      picker.dataSource = PICKER_DATA;
      picker.addEventListener('emoji-click', function (e) {
        pickerBox.hidden = true;
        var emoji = e.detail.unicode;
        choose(fixedByEmoji[emoji] || emoji);
      });
      pickerBox.appendChild(picker);
    });
    pickerReady.then(function () { pickerBox.hidden = false; }).catch(function () {});
  });

  g.bindForm(signBox.querySelector('.sign-form'), function () {
    state.guest = true;
    signBox.hidden = true;
    if (pending) react(pending);
    pending = null;
  });
})();
