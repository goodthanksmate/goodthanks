// The spinning ASCII donut on the home page, after Andy Sloane's donut.c (2006) and his
// write-up of the maths behind it: https://www.a1k0n.net/2011/07/20/donut-math.html
(function () {
  var pre = document.querySelector('.donut');
  if (!pre) return;

  var COLS = 50, ROWS = 25;           // characters are about twice as tall as wide
  var R1 = 1, R2 = 2, K2 = 5;         // tube radius, donut radius, distance from viewer
  var K1 = COLS * K2 * 3 / (8 * (R1 + R2));
  var SHADES = '.,-~:;=!*#$@';
  var A = 1, B = 1;

  function frame() {
    var out = new Array(COLS * ROWS).fill(' ');
    var depth = new Array(COLS * ROWS).fill(0);
    var cosA = Math.cos(A), sinA = Math.sin(A), cosB = Math.cos(B), sinB = Math.sin(B);

    for (var theta = 0; theta < 2 * Math.PI; theta += 0.07) {
      var cosT = Math.cos(theta), sinT = Math.sin(theta);
      var cx = R2 + R1 * cosT, cy = R1 * sinT;   // a point on the tube's circle

      for (var phi = 0; phi < 2 * Math.PI; phi += 0.02) {
        var cosP = Math.cos(phi), sinP = Math.sin(phi);
        // Spin that circle around the donut's axis, then tilt the whole donut by A and B
        var x = cx * (cosB * cosP + sinA * sinB * sinP) - cy * cosA * sinB;
        var y = cx * (sinB * cosP - sinA * cosB * sinP) + cy * cosA * cosB;
        var ooz = 1 / (K2 + cosA * cx * sinP + cy * sinA);
        var xp = Math.floor(COLS / 2 + K1 * ooz * x);
        var yp = Math.floor(ROWS / 2 - K1 * ooz * y / 2);
        // How directly this bit of surface faces the light (up and behind the viewer)
        var L = cosP * cosT * sinB - cosA * cosT * sinP - sinA * sinT + cosB * (cosA * sinT - cosT * sinA * sinP);

        if (L > 0 && xp >= 0 && xp < COLS && yp >= 0 && yp < ROWS) {
          var i = xp + COLS * yp;
          if (ooz > depth[i]) { depth[i] = ooz; out[i] = SHADES[Math.floor(L * 8)]; }
        }
      }
    }

    var text = '';
    for (var r = 0; r < ROWS; r++) text += out.slice(r * COLS, (r + 1) * COLS).join('') + '\n';
    pre.textContent = text;
  }

  frame();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var last = 0;
  (function loop(t) {
    if (t - last > 33) {              // about 30 frames a second
      last = t;
      A += 0.04;
      B += 0.02;
      frame();
    }
    requestAnimationFrame(loop);
  })(0);
})();
