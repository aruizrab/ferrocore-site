/* Hero animation: a stylised 5G core.
   Network functions on a service-based bus, three gNB cells, UEs that move
   and hand over (A3-style: a neighbour must be better by a hysteresis margin),
   and signalling messages travelling along N1, N2, N3, N4, N6, Xn and SBI.
   Honours prefers-reduced-motion (static frame, opt-in play), pauses when
   off-screen or hidden, and reads its colours from CSS custom properties. */
(function () {
  "use strict";

  var canvas = document.getElementById("core-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var wrap = canvas.parentElement;
  var fig = canvas.closest ? canvas.closest("figure") : null;
  var btn = (fig || document).querySelector(".anim-toggle");
  var btnLabel = btn ? btn.querySelector(".anim-toggle-label") : null;
  var reduceMql = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  /* ---------- Virtual layout (640 x 540) ---------- */
  var W = 640, H = 540;
  var BUS_Y = 128;
  var N2_Y = 258;   /* N2 trunk: gNBs -> AMF, kept above the N3 trunk */
  var N3_Y = 336;   /* N3 trunk: gNBs -> UPF */
  var XN_Y = 400;   /* Xn links run between the towers */
  var STUB_Y = 370; /* where a tower's N2 and N3 stubs fork */
  var BOX_W = 84, BOX_H = 34;
  var NF = {
    NRF: { x: 80, y: 62, top: true },
    AUSF: { x: 200, y: 62, top: true },
    UDM: { x: 320, y: 62, top: true },
    PCF: { x: 440, y: 62, top: true },
    NSSF: { x: 560, y: 62, top: true },
    AMF: { x: 170, y: 192, top: false, key: true },
    SMF: { x: 440, y: 192, top: false, key: true },
    UPF: { x: 520, y: 298, top: false, key: true, noSbi: true }
  };
  Object.keys(NF).forEach(function (k) { NF[k].name = k; NF[k].flash = 0; });
  var DN = { x: 604, y: 298, r: 20 };
  var GNBS = [
    { name: "gNB 1", x: 110, y: 398, flash: 0 },
    { name: "gNB 2", x: 300, y: 398, flash: 0 },
    { name: "gNB 3", x: 490, y: 398, flash: 0 }
  ];
  var CELL_CY = 446, CELL_RX = 122, CELL_RY = 74;
  var UE_MIN_X = 22, UE_MAX_X = 618, UE_MIN_Y = 424, UE_MAX_Y = 508;
  var HYST = 26; /* handover margin, virtual units */
  var MAX_UES = 8;

  /* ---------- Colours ---------- */
  var C = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["n1", "n2", "n3", "n4", "sbi", "xn", "link-strong", "node", "node-line", "node-text", "cell", "cell-line", "ue", "link"].forEach(function (k) {
      C[k] = cs.getPropertyValue("--c-" + k).trim() || "#888";
    });
    C.rust = cs.getPropertyValue("--rust").trim() || "#c0502a";
    C.muted = cs.getPropertyValue("--muted").trim() || "#777";
    C.surface = cs.getPropertyValue("--surface").trim() || "#fff";
    C.mono = cs.getPropertyValue("--font-mono").trim() || "monospace";
  }

  /* ---------- Geometry helpers ---------- */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function nfBottom(n) { return { x: n.x, y: n.y + BOX_H / 2 }; }
  function nfTop(n) { return { x: n.x, y: n.y - BOX_H / 2 }; }
  function towerTop(g) { return { x: g.x, y: g.y - 20 }; }

  /* N2 and N3 are drawn as orthogonal trunks so the N2 lines never cut
     diagonally across the N3 fan: each tower forks into an N2 stub (left)
     and an N3 stub (right). */
  function n2Stub(g) { return [towerTop(g), { x: g.x - 7, y: STUB_Y }, { x: g.x - 7, y: N2_Y }]; }
  function n3Stub(g) { return [towerTop(g), { x: g.x + 7, y: STUB_Y }, { x: g.x + 7, y: N3_Y }]; }
  function n2Route(gi) {
    return n2Stub(GNBS[gi]).concat([{ x: NF.AMF.x, y: N2_Y }, nfBottom(NF.AMF)]);
  }
  function n3Route(gi) {
    return n3Stub(GNBS[gi]).concat([{ x: NF.UPF.x, y: N3_Y }, nfBottom(NF.UPF)]);
  }
  function n4Route(from) {
    var pts = [
      { x: NF.SMF.x + 30, y: NF.SMF.y + BOX_H / 2 }, { x: NF.SMF.x + 30, y: 232 },
      { x: NF.UPF.x - 20, y: 232 }, { x: NF.UPF.x - 20, y: NF.UPF.y - BOX_H / 2 }
    ];
    return from === "SMF" ? pts : pts.reverse();
  }
  function n6Route(up) {
    var u = { x: NF.UPF.x + BOX_W / 2, y: NF.UPF.y }, d = { x: DN.x - DN.r, y: DN.y };
    return up ? [u, d] : [d, u];
  }
  function sbiRoute(a, b) {
    var A = NF[a], B = NF[b];
    var pa = A.top ? nfBottom(A) : nfTop(A);
    var pb = B.top ? nfBottom(B) : nfTop(B);
    return [pa, { x: A.x, y: BUS_Y }, { x: B.x, y: BUS_Y }, pb];
  }
  function xnRoute(ga, gb) {
    var a = GNBS[ga], b = GNBS[gb], dir = b.x > a.x ? 1 : -1;
    return [{ x: a.x + dir * 14, y: XN_Y }, { x: b.x - dir * 14, y: XN_Y }];
  }
  function uePos(ue) { return { x: ue.x, y: ue.y }; }
  function uuRoute(ue, up) {
    var r = [uePos(ue), towerTop(GNBS[ue.serving])];
    return up ? r : r.reverse();
  }
  function upRoute(ue) { return [uePos(ue)].concat(n2Route(ue.serving)); }
  function downRoute(ue) { return n2Route(ue.serving).slice().reverse().concat([uePos(ue)]); }

  function buildPath(pts) {
    var segs = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      var len = Math.sqrt(dx * dx + dy * dy);
      segs.push(len); total += len;
    }
    return { pts: pts, segs: segs, total: total };
  }
  function pointAt(path, d) {
    if (d <= 0) return path.pts[0];
    for (var i = 0; i < path.segs.length; i++) {
      var L = path.segs[i];
      if (d <= L || i === path.segs.length - 1) {
        var t = L ? Math.min(1, d / L) : 1;
        var a = path.pts[i], b = path.pts[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      d -= L;
    }
    return path.pts[path.pts.length - 1];
  }

  /* ---------- Simulation state ---------- */
  var now = 0;
  var timers = [];
  var packets = [];
  var ues = [];
  var rings = [];
  var ueSeq = 0;

  function later(dt, fn) { timers.push({ at: now + dt, fn: fn }); }

  function flashNear(p) {
    var best = null, bd = 40 * 40;
    Object.keys(NF).forEach(function (k) {
      var n = NF[k], dx = n.x - p.x, dy = n.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = n; }
    });
    GNBS.forEach(function (g) {
      var dx = g.x - p.x, dy = (g.y - 20) - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = g; }
    });
    if (best) best.flash = 1;
  }

  function send(route, color, label, done, small) {
    var path = buildPath(route);
    packets.push({
      path: path, d: 0, speed: small ? 210 : 250, color: color,
      label: label || null, small: !!small, done: done || null
    });
  }

  /* Run a list of steps one after another. A step is either a function or
     { r: () => route, c: colour key, l: label, d: delay after }. The guard
     stops the chain when it returns false (for example the UE has left). */
  function chain(steps, guard, i) {
    i = i || 0;
    if (i >= steps.length) return;
    if (guard && !guard()) return;
    var s = steps[i];
    if (typeof s === "function") { s(); chain(steps, guard, i + 1); return; }
    send(s.r(), s.c, s.l, function (end) {
      flashNear(end);
      later(s.d != null ? s.d : 0.06, function () { chain(steps, guard, i + 1); });
    });
  }

  function nearestCell(x, y) {
    var best = 0, bd = Infinity;
    GNBS.forEach(function (g, i) {
      var dx = g.x - x, dy = CELL_CY - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function cellDist(ue, gi) {
    var dx = GNBS[gi].x - ue.x, dy = CELL_CY - ue.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function spawnUe(x) {
    var ue = {
      id: ++ueSeq,
      x: x != null ? x : rand(UE_MIN_X + 20, UE_MAX_X - 20),
      baseY: rand(UE_MIN_Y + 8, UE_MAX_Y - 8),
      vx: (Math.random() < 0.5 ? -1 : 1) * rand(10, 22),
      phase: rand(0, Math.PI * 2),
      state: "idle",
      alive: true, leaving: false, fade: 0, ho: false,
      nextUp: 0
    };
    ue.y = ue.baseY;
    ue.serving = nearestCell(ue.x, ue.y);
    ues.push(ue);
    later(rand(0.2, 0.6), function () { register(ue); });
    return ue;
  }

  function ueGuard(ue) { return function () { return ue.alive; }; }

  function register(ue) {
    if (!ue.alive) return;
    ue.state = "registering";
    chain([
      { r: function () { return upRoute(ue); }, c: "n1", l: "Registration Request" },
      { r: function () { return sbiRoute("AMF", "AUSF"); }, c: "sbi", l: "Nausf_UEAuthentication" },
      { r: function () { return sbiRoute("AUSF", "UDM"); }, c: "sbi", l: "Nudm_UEAuthentication" },
      { r: function () { return sbiRoute("UDM", "AUSF"); }, c: "sbi" },
      { r: function () { return sbiRoute("AUSF", "AMF"); }, c: "sbi" },
      { r: function () { return downRoute(ue); }, c: "n1", l: "Authentication Request" },
      { r: function () { return upRoute(ue); }, c: "n1", l: "Authentication Response" },
      { r: function () { return downRoute(ue); }, c: "n1", l: "Security Mode Command" },
      { r: function () { return upRoute(ue); }, c: "n1" },
      { r: function () { return sbiRoute("AMF", "UDM"); }, c: "sbi", l: "Nudm_UECM" },
      { r: function () { return downRoute(ue); }, c: "n1", l: "Registration Accept" },
      { r: function () { return upRoute(ue); }, c: "n1", l: "Registration Complete", d: 0.35 },
      function () { ue.state = "registered"; },
      { r: function () { return upRoute(ue); }, c: "n1", l: "PDU Session Establishment Request" },
      { r: function () { return sbiRoute("AMF", "SMF"); }, c: "sbi", l: "Nsmf_PDUSession_CreateSMContext" },
      { r: function () { return sbiRoute("SMF", "PCF"); }, c: "sbi", l: "Npcf_SMPolicyControl" },
      { r: function () { return sbiRoute("PCF", "SMF"); }, c: "sbi" },
      { r: function () { return n4Route("SMF"); }, c: "n4", l: "PFCP Session Establishment" },
      { r: function () { return n4Route("UPF"); }, c: "n4" },
      { r: function () { return sbiRoute("SMF", "AMF"); }, c: "sbi" },
      { r: function () { return n2Route(ue.serving).slice().reverse(); }, c: "n2", l: "PDU Session Resource Setup" },
      { r: function () { return uuRoute(ue, false); }, c: "n1", l: "PDU Session Establishment Accept" },
      { r: function () { return n2Route(ue.serving); }, c: "n2", l: "PDU Session Resource Setup Response" },
      { r: function () { return sbiRoute("AMF", "SMF"); }, c: "sbi", l: "Nsmf_PDUSession_UpdateSMContext" },
      { r: function () { return n4Route("SMF"); }, c: "n4", l: "PFCP Session Modification" },
      { r: function () { return n4Route("UPF"); }, c: "n4" },
      { r: function () { return sbiRoute("SMF", "AMF"); }, c: "sbi" },
      function () { ue.state = "connected"; ue.nextUp = now + rand(0.3, 1.2); }
    ], ueGuard(ue));
  }

  function handover(ue, from, to) {
    ue.serving = to;
    ue.ho = true;
    rings.push({ x: ue.x, y: ue.y, t: 0 });
    chain([
      { r: function () { return xnRoute(from, to); }, c: "xn", l: "Xn Handover Request" },
      { r: function () { return xnRoute(to, from); }, c: "xn", l: "Handover Request Ack" },
      { r: function () { return n2Route(to); }, c: "n2", l: "Path Switch Request" },
      { r: function () { return sbiRoute("AMF", "SMF"); }, c: "sbi", l: "Nsmf_UpdateSMContext" },
      { r: function () { return n4Route("SMF"); }, c: "n4", l: "PFCP Session Modification" },
      { r: function () { return n4Route("UPF"); }, c: "n4" },
      { r: function () { return sbiRoute("SMF", "AMF"); }, c: "sbi" },
      { r: function () { return n2Route(to).slice().reverse(); }, c: "n2", l: "Path Switch Ack" },
      function () { ue.ho = false; }
    ], ueGuard(ue));
  }

  function deregister(ue) {
    ue.leaving = true;
    chain([
      { r: function () { return upRoute(ue); }, c: "n1", l: "Deregistration Request" },
      { r: function () { return sbiRoute("AMF", "SMF"); }, c: "sbi" },
      { r: function () { return n4Route("SMF"); }, c: "n4", l: "PFCP Session Deletion" },
      function () { ue.state = "gone"; }
    ]);
    later(rand(2.5, 4.5), function () {
      ue.alive = false;
      later(rand(0.8, 2.5), function () { if (countUes() < MAX_UES) spawnUe(); });
    });
  }

  function countUes() {
    var n = 0;
    for (var i = 0; i < ues.length; i++) if (ues[i].alive && !ues[i].leaving) n++;
    return n;
  }

  function userPlane(ue) {
    if (packets.length > 70) return;
    var gi = ue.serving;
    /* Uu (radio) and N6 (to the data network) hops are neutral; only the
       GTP-U tunnel between gNB and UPF is drawn in the N3 colour. */
    if (Math.random() < 0.55) {
      send(uuRoute(ue, true), "link-strong", null, function () {
        send(n3Route(gi), "n3", null, function () { send(n6Route(true), "link-strong", null, null, true); }, true);
      }, true);
    } else {
      send(n6Route(false), "link-strong", null, function () {
        send(n3Route(gi).slice().reverse(), "n3", null, function () {
          if (ue.alive) send(uuRoute(ue, false), "link-strong", null, null, true);
        }, true);
      }, true);
    }
  }

  function boot() {
    var regs = ["AUSF", "UDM", "PCF", "NSSF", "AMF", "SMF"];
    regs.forEach(function (k, i) {
      later(0.1 + i * 0.18, function () {
        send(sbiRoute(k, "NRF"), "sbi", i === 0 ? "Nnrf_NFManagement" : null, function (e) { flashNear(e); });
      });
    });
    GNBS.forEach(function (g, i) {
      later(1.3 + i * 0.35, function () {
        send(n2Route(i), "n2", i === 0 ? "NG Setup Request" : null, function (e) {
          flashNear(e);
          send(n2Route(i).slice().reverse(), "n2", i === 0 ? "NG Setup Response" : null, function (e2) { flashNear(e2); });
        });
      });
    });
    for (var u = 0; u < MAX_UES; u++) {
      (function (u) {
        later(2.6 + u * 0.9, function () { spawnUe(UE_MIN_X + 40 + (u * 73) % (UE_MAX_X - UE_MIN_X - 80)); });
      })(u);
    }
  }

  function step(dt) {
    now += dt;

    /* timers */
    if (timers.length) {
      var due = [];
      timers = timers.filter(function (t) { if (t.at <= now) { due.push(t); return false; } return true; });
      due.sort(function (a, b) { return a.at - b.at; }).forEach(function (t) { t.fn(); });
    }

    /* packets */
    for (var i = packets.length - 1; i >= 0; i--) {
      var p = packets[i];
      p.d += p.speed * dt;
      if (p.d >= p.path.total) {
        packets.splice(i, 1);
        if (p.done) p.done(p.path.pts[p.path.pts.length - 1]);
      }
    }

    /* UEs */
    ues.forEach(function (ue) {
      if (!ue.alive) return;
      if (ue.leaving) { ue.fade = Math.min(1, ue.fade + dt / 3); return; }
      ue.x += ue.vx * dt;
      ue.phase += dt * 0.9;
      ue.y = ue.baseY + Math.sin(ue.phase) * 9;
      if (ue.x < UE_MIN_X || ue.x > UE_MAX_X) {
        ue.x = Math.max(UE_MIN_X, Math.min(UE_MAX_X, ue.x));
        if (ue.state === "connected" && Math.random() < 0.5) { deregister(ue); return; }
        ue.vx = -ue.vx;
      }
      /* A3-style handover: neighbour better than serving by HYST */
      var best = nearestCell(ue.x, ue.y);
      if (best !== ue.serving && cellDist(ue, best) + HYST < cellDist(ue, ue.serving)) {
        if (ue.state === "connected") { if (!ue.ho) handover(ue, ue.serving, best); }
        /* Idle, registering or registered: plain cell reselection; any
           signalling still to come goes through the new cell. */
        else if (ue.state !== "gone") ue.serving = best;
      }
      if (ue.state === "connected" && now >= ue.nextUp) {
        ue.nextUp = now + rand(0.9, 2.6);
        userPlane(ue);
      }
    });
    ues = ues.filter(function (u) { return u.alive; });

    rings.forEach(function (r) { r.t += dt; });
    rings = rings.filter(function (r) { return r.t < 1.1; });

    Object.keys(NF).forEach(function (k) { NF[k].flash = Math.max(0, NF[k].flash - dt * 2.2); });
    GNBS.forEach(function (g) { g.flash = Math.max(0, g.flash - dt * 2.2); });
  }

  /* ---------- Rendering ---------- */
  var dpr = 1, scale = 1, offX = 0, offY = 0, fontK = 1, showLabels = true;

  function resize() {
    var r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    scale = Math.min(r.width / W, r.height / H);
    offX = (r.width - W * scale) / 2;
    offY = (r.height - H * scale) / 2;
    fontK = Math.min(1.7, Math.max(1, 0.8 / scale));
    showLabels = scale >= 0.66;
  }

  /* Font size in virtual units for a base size, never below MIN_PX CSS pixels. */
  var MIN_PX = 10;
  function px(base) { return Math.max(base * fontK, MIN_PX / scale); }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function line(pts, color, width, alpha, dash) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function tag(text, x, y, color, align) {
    var fs = px(11.5);
    ctx.font = "700 " + fs + "px " + C.mono;
    var w = ctx.measureText(text).width + 8 * fontK, h = fs + 6;
    var bx = align === "left" ? x : x - w / 2;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = C.surface;
    roundRect(bx, y - h / 2, w, h, 4);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 4 * fontK, y + 0.5);
  }

  function drawStatic() {
    /* zone divider; labels sit left of gNB 1's stubs, shortened when large */
    line([{ x: 12, y: 352 }, { x: W - 12, y: 352 }], C["node-line"], 1, 0.35, [2, 6]);
    ctx.fillStyle = C.muted;
    ctx.font = "600 " + px(9.5) + "px " + C.mono;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var room = GNBS[0].x - 7 - 6 - 14;
    ctx.fillText(ctx.measureText("5G CORE").width <= room ? "5G CORE" : "CORE", 14, 344);
    ctx.textBaseline = "top";
    ctx.fillText(ctx.measureText("SIMULATED RAN").width <= room ? "SIMULATED RAN" : "RAN", 14, 360);

    /* cells */
    GNBS.forEach(function (g) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(g.x, CELL_CY, CELL_RX, CELL_RY, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.cell;
      ctx.fill();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = C["cell-line"];
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });

    /* links */
    var sbiX0 = 40, sbiX1 = 600;
    line([{ x: sbiX0, y: BUS_Y }, { x: sbiX1, y: BUS_Y }], C.sbi, 3, 0.55);
    Object.keys(NF).forEach(function (k) {
      var n = NF[k];
      if (n.noSbi) return;
      line([n.top ? nfBottom(n) : nfTop(n), { x: n.x, y: BUS_Y }], C.sbi, 2, 0.5);
    });
    /* N2 and N3: one stub per tower, then a shared trunk drawn once. */
    var first = GNBS[0], last = GNBS[GNBS.length - 1];
    GNBS.forEach(function (g) {
      line(n2Stub(g), C.n2, 1.6, 0.5);
      line(n3Stub(g), C.n3, 1.6, 0.5);
    });
    line([{ x: first.x - 7, y: N2_Y }, { x: last.x - 7, y: N2_Y }], C.n2, 1.6, 0.5);
    line([{ x: NF.AMF.x, y: N2_Y }, nfBottom(NF.AMF)], C.n2, 1.6, 0.5);
    line([{ x: first.x + 7, y: N3_Y }, { x: NF.UPF.x, y: N3_Y }, nfBottom(NF.UPF)], C.n3, 1.6, 0.5);
    for (var i = 1; i < GNBS.length; i++) line(xnRoute(i - 1, i), C.xn, 1.4, 0.7, [4, 4]);
    line(n4Route("SMF"), C.n4, 1.8, 0.55);
    line(n6Route(true), C["link-strong"], 1.8, 0.7, [3, 3]);

    tag("SBI", 42, BUS_Y - 13, C.sbi, "left");
    tag("N2", 236, N2_Y, C.n2);
    tag("N3", 392, N3_Y, C.n3);
    tag("N4", NF.UPF.x - 14, 252, C.n4, "left");
    tag("Xn", (GNBS[0].x + GNBS[1].x) / 2, XN_Y, C.xn);
  }

  function drawNodes() {
    Object.keys(NF).forEach(function (k) {
      var n = NF[k];
      var x = n.x - BOX_W / 2, y = n.y - BOX_H / 2;
      ctx.save();
      if (n.flash > 0) {
        ctx.shadowColor = C.rust;
        ctx.shadowBlur = 16 * n.flash;
      }
      ctx.fillStyle = C.node;
      roundRect(x, y, BOX_W, BOX_H, 8);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = n.key ? 1.8 : 1.2;
      ctx.strokeStyle = n.flash > 0.05 ? C.rust : (n.key ? C.rust : C["node-line"]);
      ctx.globalAlpha = n.key ? 0.9 : 1;
      roundRect(x, y, BOX_W, BOX_H, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = C["node-text"];
      ctx.font = "700 " + px(14) + "px " + C.mono;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(k, n.x, n.y + 1);
    });

    /* DN */
    ctx.save();
    ctx.beginPath();
    ctx.arc(DN.x, DN.y, DN.r, 0, Math.PI * 2);
    ctx.fillStyle = C.node;
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = C["node-line"];
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.muted;
    ctx.font = "700 " + px(10.5) + "px " + C.mono;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DN", DN.x, DN.y + 1);

    /* gNB towers */
    GNBS.forEach(function (g) {
      ctx.save();
      ctx.strokeStyle = g.flash > 0.05 ? C.rust : C["node-text"];
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(g.x - 9, g.y + 14); ctx.lineTo(g.x, g.y - 16); ctx.lineTo(g.x + 9, g.y + 14);
      ctx.moveTo(g.x - 5, g.y + 2); ctx.lineTo(g.x + 5, g.y + 2);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.75;
      for (var r = 1; r <= 2; r++) {
        ctx.beginPath(); ctx.arc(g.x, g.y - 16, 6 * r, -Math.PI * 0.85, -Math.PI * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.arc(g.x, g.y - 16, 6 * r, -Math.PI * 0.45, -Math.PI * 0.15); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = C["node-text"];
      ctx.font = "700 " + px(11.5) + "px " + C.mono;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(g.name, g.x, g.y + 18);
    });
  }

  function drawUes() {
    ues.forEach(function (ue) {
      var a = 1 - ue.fade;
      if (a <= 0) return;
      var g = GNBS[ue.serving];
      if (ue.state !== "gone") line([{ x: ue.x, y: ue.y - 7 }, towerTop(g)], C.ue, 1, 0.16 * a, [2, 4]);
      ctx.save();
      ctx.globalAlpha = a;
      var w = 9 * Math.min(fontK, 1.3), h = 14 * Math.min(fontK, 1.3);
      roundRect(ue.x - w / 2, ue.y - h / 2, w, h, 2.5);
      if (ue.state === "connected" || ue.state === "registered") {
        ctx.fillStyle = ue.state === "connected" ? C.n3 : C.ue;
        ctx.fill();
      } else {
        ctx.fillStyle = C.node;
        ctx.fill();
      }
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = C.ue;
      ctx.stroke();
      ctx.restore();
    });
    rings.forEach(function (r) {
      var k = r.t / 1.1;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = C.rust;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8 + k * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  /* Packet shape per interface, matching the legend swatches, so colour is
     never the only cue: N1 ring, N2 disc, N4 square, SBI diamond, Xn
     triangle, user plane (N3, N6, Uu) small dots. */
  var SHAPE = { n1: "ring", n2: "circle", n3: "circle", n4: "square", sbi: "diamond", xn: "triangle", "link-strong": "circle" };
  function markPath(shape, x, y, r) {
    ctx.beginPath();
    if (shape === "square") {
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    } else if (shape === "diamond") {
      var d = r * 1.3;
      ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath();
    } else if (shape === "triangle") {
      var t = r * 1.3;
      ctx.moveTo(x, y - t); ctx.lineTo(x + t, y + t * 0.8); ctx.lineTo(x - t, y + t * 0.8); ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }

  function drawPackets() {
    var labels = 0;
    packets.forEach(function (p) {
      var col = C[p.color] || C.rust;
      var shape = SHAPE[p.color] || "circle";
      var rad = p.small ? 2.4 : 4.2;
      ctx.fillStyle = col;
      for (var t = 3; t >= 1; t--) {
        var q = pointAt(p.path, p.d - t * (p.small ? 4 : 6));
        ctx.globalAlpha = 0.12 * (4 - t);
        markPath(shape === "ring" ? "circle" : shape, q.x, q.y, rad * (1 - t * 0.15)); ctx.fill();
      }
      var pt = pointAt(p.path, p.d);
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, rad * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (shape === "ring") {
        markPath("circle", pt.x, pt.y, rad);
        ctx.fillStyle = C.surface; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      } else {
        markPath(shape, pt.x, pt.y, rad); ctx.fill();
      }
      p.pt = pt;
    });
    if (!showLabels) return;
    var boxes = [];
    for (var i = packets.length - 1; i >= 0 && labels < 3; i--) {
      var p = packets[i];
      if (!p.label || !p.pt) continue;
      var fs = px(11.5);
      ctx.font = "600 " + fs + "px " + C.mono;
      var w = ctx.measureText(p.label).width + 12;
      var x = Math.max(6 + w / 2, Math.min(W - 6 - w / 2, p.pt.x));
      var y = Math.max(14, p.pt.y - 16);
      var hit = false;
      for (var j = 0; j < boxes.length; j++) {
        var o = boxes[j];
        if (Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < fs + 10) { hit = true; break; }
      }
      if (hit) continue;
      boxes.push({ x: x, y: y, w: w });
      labels++;
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = C.surface;
      roundRect(x - w / 2, y - fs / 2 - 4, w, fs + 8, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C[p.color] || C.rust;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C["node-text"];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.label, x, y + 0.5);
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    ctx.lineJoin = "round";
    drawStatic();
    drawNodes();
    drawUes();
    drawPackets();
  }

  /* ---------- Loop control ---------- */
  var running = false, userPaused = false, visible = true, raf = 0, last = 0;

  function frame(ts) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    step(dt);
    draw();
    raf = window.requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true; last = 0;
    raf = window.requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }
  function update() {
    if (!userPaused && visible && !document.hidden) start(); else stop();
  }
  /* The label states the action ("Pause animation" / "Play animation");
     there is deliberately no aria-pressed, which would contradict it. */
  function setPaused(p) {
    userPaused = p;
    if (btn) {
      btn.setAttribute("data-paused", p ? "true" : "false");
      if (btnLabel) btnLabel.textContent = p ? "Play animation" : "Pause animation";
    }
    update();
    if (p) draw();
  }

  /* Pre-roll the simulation so the first frame already shows a busy core. */
  function preroll(seconds) {
    var n = Math.round(seconds / (1 / 30));
    for (var i = 0; i < n; i++) step(1 / 30);
  }

  readColors();
  resize();
  boot();
  var reduce = !!(reduceMql && reduceMql.matches);
  /* Long enough that the first paint already shows registered UEs. */
  preroll(reduce ? 14 : 6);
  draw();
  /* Canvas text does not re-render when the web fonts arrive; redraw then. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(); });

  if (btn) {
    btn.hidden = false;
    btn.addEventListener("click", function () { setPaused(!userPaused); });
  }
  setPaused(reduce);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.05 }).observe(wrap);
  }
  document.addEventListener("visibilitychange", update);

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () { resize(); draw(); }).observe(wrap);
  } else {
    window.addEventListener("resize", function () { resize(); draw(); });
  }

  document.addEventListener("ferrocore:themechange", function () { readColors(); draw(); });
  if (reduceMql) {
    var onReduce = function () { setPaused(reduceMql.matches); };
    if (reduceMql.addEventListener) reduceMql.addEventListener("change", onReduce);
    else if (reduceMql.addListener) reduceMql.addListener(onReduce);
  }
})();
