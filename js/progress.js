/* Live progress: renders ./progress.json (same origin).
   Schema 1:
   { schema: 1, placeholder: bool, generatedAt: ISO 8601, commit: "<sha7>",
     method: "<one line>", overall: 0-100,
     milestones: [{ id, name, percent, features }],   features: count (a list of ids is accepted)
     features:   [{ id, name, milestone, stage, percent }] }
   All text is inserted with textContent; nothing from the file is parsed as HTML. */
(function () {
  "use strict";

  var root = document.getElementById("progress-root");
  if (!root) return;

  var STAGES = [
    ["merged", "Merged"],
    ["implemented", "Implemented"],
    ["implementing", "Implementing"],
    ["tests", "Tests (red)"],
    ["planned", "Planned"],
    ["spec-approved", "Spec approved"],
    ["spec-draft", "Spec draft"],
    ["not-started", "Not started"]
  ];
  var STAGE_LABEL = {};
  STAGES.forEach(function (s) { STAGE_LABEL[s[0]] = s[1]; });
  var IN_FLIGHT = { implemented: 1, implementing: 1, tests: 1, planned: 1, "spec-approved": 1, "spec-draft": 1 };

  var SVG_NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "class") el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function s(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    return el;
  }

  function pct(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
  }
  function fmtPct(v) { return (Math.round(v) === v ? String(v) : v.toFixed(1)) + "%"; }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : ""; }

  function stageClass(stage) { return STAGE_LABEL[stage] ? "stage stage-" + stage : "stage"; }
  function stageBadge(stage) {
    return h("span", { class: stageClass(stage), text: STAGE_LABEL[stage] || "Unknown" });
  }

  var placeholderMode = false;

  function bar(value, label) {
    if (placeholderMode) label += " (placeholder)";
    var fill = h("span", { class: "bar-fill" + (value >= 100 ? " is-done" : "") });
    var b = h("span", {
      class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100",
      "aria-valuenow": String(value), "aria-label": label
    }, [fill]);
    fill.dataset.target = String(value);
    return b;
  }

  function animateBars(scope) {
    var fills = scope.querySelectorAll(".bar-fill");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var apply = function () {
      for (var i = 0; i < fills.length; i++) fills[i].style.width = fills[i].dataset.target + "%";
    };
    if (reduce) apply(); else window.requestAnimationFrame(function () { window.requestAnimationFrame(apply); });
  }

  function gauge(value, placeholder) {
    var R = 70, C = 2 * Math.PI * R;
    var svg = s("svg", {
      viewBox: "0 0 170 170", class: "gauge", role: "img",
      "aria-label": "Overall completion " + fmtPct(value) + (placeholder ? " (placeholder)" : "")
    });
    svg.appendChild(s("circle", { cx: "85", cy: "85", r: String(R), class: "gauge-track" }));
    svg.appendChild(s("circle", { cx: "85", cy: "85", r: String(R + 7.5), class: "gauge-edge" }));
    svg.appendChild(s("circle", { cx: "85", cy: "85", r: String(R - 7.5), class: "gauge-edge" }));
    var arc = s("circle", { cx: "85", cy: "85", r: String(R), class: "gauge-value" });
    arc.style.strokeDasharray = C.toFixed(2);
    arc.style.strokeDashoffset = C.toFixed(2);
    svg.appendChild(arc);
    svg.appendChild(s("text", { x: "85", y: "88", "text-anchor": "middle", class: "gauge-num", text: fmtPct(value) }));
    svg.appendChild(s("text", { x: "85", y: "112", "text-anchor": "middle", class: "gauge-sub", text: placeholder ? "placeholder" : "complete" }));
    var target = (C * (1 - value / 100)).toFixed(2);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) arc.style.strokeDashoffset = target;
    else window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { arc.style.strokeDashoffset = target; }); });
    return svg;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return null;
    var text;
    try {
      text = new Intl.DateTimeFormat("en-GB", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
      }).format(d) + " UTC";
    } catch (e) { text = d.toISOString().replace("T", " ").slice(0, 16) + " UTC"; }
    return { iso: d.toISOString(), text: text };
  }

  function validate(data) {
    if (!data || typeof data !== "object") return "the file is not a JSON object";
    if (data.schema !== 1) return "unsupported schema version";
    if (!Array.isArray(data.milestones)) return "missing milestones";
    if (!Array.isArray(data.features)) return "missing features";
    return null;
  }

  function showError(title, detail) {
    root.textContent = "";
    root.appendChild(h("p", { class: "progress-error" }, [
      h("strong", { text: title }), " ", detail || "",
      " The roadmap above still describes the plan."
    ]));
    root.setAttribute("aria-busy", "false");
  }

  function render(data) {
    var problem = validate(data);
    if (problem) { showError("Progress data could not be read:", problem + "."); return; }

    var overall = pct(data.overall);
    var milestones = data.milestones.slice(0, 32).map(function (m) {
      var count = Array.isArray(m.features) ? m.features.length : Number(m.features);
      return { id: str(m.id, 8), name: str(m.name, 80), percent: pct(m.percent), features: count > 0 ? Math.floor(count) : 0 };
    });
    var features = data.features.slice(0, 500).map(function (f) {
      return { id: str(f.id, 12), name: str(f.name, 120), milestone: str(f.milestone, 8), stage: str(f.stage, 24), percent: pct(f.percent) };
    });

    var frag = document.createDocumentFragment();

    placeholderMode = data.placeholder === true;
    root.classList.toggle("is-placeholder", placeholderMode);
    if (placeholderMode) {
      frag.appendChild(h("div", { class: "placeholder-banner", role: "note" }, [
        h("p", null, [
          h("strong", { text: "Placeholder data" }),
          "These numbers are illustrative, not measured. Live values will appear here once the project's CI starts publishing progress.json."
        ])
      ]));
    }

    /* Overall + meta */
    var when = fmtDate(data.generatedAt);
    var sha = str(data.commit, 40);
    var meta = h("p", { class: "overall-meta" });
    if (when) {
      meta.appendChild(document.createTextNode("Generated "));
      meta.appendChild(h("time", { datetime: when.iso, text: when.text }));
    }
    /* An all-zero sha marks placeholder data: there is no real commit to show. */
    if (/^[0-9a-f]{7,40}$/i.test(sha) && !/^0+$/.test(sha)) {
      if (when) meta.appendChild(h("br"));
      meta.appendChild(document.createTextNode("at commit "));
      meta.appendChild(h("code", { text: sha.slice(0, 7).toLowerCase() }));
    }
    var overallBox = h("div", { class: "overall" }, [
      h("h3", { class: "minor", text: "Overall" }),
      gauge(overall, placeholderMode),
      meta
    ]);

    /* Milestone bars */
    var list = h("ol");
    milestones.forEach(function (m) {
      list.appendChild(h("li", { class: "bar-row" }, [
        h("span", { class: "bar-id", text: m.id }),
        h("span", { class: "bar-name", text: m.name + (m.features ? " · " + m.features + (m.features === 1 ? " feature" : " features") : "") }),
        bar(m.percent, m.id + " " + m.name + " completion"),
        h("span", { class: "bar-pct", text: fmtPct(m.percent) })
      ]));
    });
    var msBox = h("div", { class: "ms-bars" }, [h("h3", { class: "minor", text: "Milestones" }), list]);
    var method = str(data.method, 300);
    if (method) msBox.appendChild(h("p", { class: "method" }, [h("strong", { text: "Method: " }), method]));

    frag.appendChild(h("div", { class: "progress-top" }, [overallBox, msBox]));

    /* Features */
    frag.appendChild(h("h3", { class: "minor", text: "Features by milestone" }));
    var legend = h("ul", { class: "stage-legend", "aria-label": "Stages, from done to not started" });
    STAGES.forEach(function (st) { legend.appendChild(h("li", null, [stageBadge(st[0])])); });
    frag.appendChild(legend);

    var groups = h("div", { class: "feature-groups" });
    var order = milestones.map(function (m) { return m.id; });
    var byMs = {};
    features.forEach(function (f) {
      var key = order.indexOf(f.milestone) >= 0 ? f.milestone : "other";
      (byMs[key] = byMs[key] || []).push(f);
    });
    var keys = order.concat(byMs.other ? ["other"] : []);
    var opened = false;
    keys.forEach(function (key) {
      var items = byMs[key];
      if (!items || !items.length) return;
      var m = milestones.filter(function (x) { return x.id === key; })[0];
      var done = items.filter(function (f) { return f.stage === "merged"; }).length;
      var active = items.filter(function (f) { return IN_FLIGHT[f.stage]; }).length;
      var details = h("details", { class: "fgroup" });
      if (!opened && m && m.percent < 100) { details.open = true; opened = true; }
      var summaryText = items.length + (items.length === 1 ? " feature · " : " features · ") + done + " merged · " + active + " in progress";
      details.appendChild(h("summary", null, [
        h("span", { class: "fg-id", text: m ? m.id : "—" }),
        h("span", { class: "fg-name" }, [
          m ? m.name : "Other", " ",
          h("span", { class: "muted", text: "· " + summaryText })
        ])
      ]));
      var ul = h("ul", { class: "flist" });
      items.forEach(function (f) {
        ul.appendChild(h("li", { class: "frow" }, [
          h("span", { class: "frow-id", text: f.id }),
          h("span", { class: "frow-name", text: f.name }),
          bar(f.percent, f.id + " " + f.name + " completion"),
          stageBadge(f.stage)
        ]));
      });
      details.appendChild(ul);
      groups.appendChild(details);
    });
    frag.appendChild(groups);

    root.textContent = "";
    root.appendChild(frag);
    root.setAttribute("aria-busy", "false");
    animateBars(root);
  }

  function load() {
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, 8000) : 0;
    if (!window.fetch) { showError("Progress is unavailable:", "this browser cannot fetch it."); return; }
    window.fetch("progress.json", { cache: "no-cache", signal: ctrl ? ctrl.signal : undefined, credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status === 404 ? "progress.json has not been published yet." : "the server answered " + res.status + ".");
        return res.json().catch(function () { throw new Error("progress.json is not valid JSON."); });
      })
      .then(render)
      .catch(function (err) {
        var msg = err && err.name === "AbortError" ? "the request timed out." : (err && err.message) || "the request failed.";
        showError("Live progress is not available right now:", msg);
      })
      .then(function () { if (timer) window.clearTimeout(timer); });
  }

  load();
})();
