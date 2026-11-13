// Interactive pieces of the findings report. Each one replaces a static fallback, or reveals a
// section hidden when scripts don't run, so the page reads in full without this file. Every figure
// comes from the #report-data block, which report/build.mjs writes from findings.json. The DOM is
// built with createElement and textContent only, never from HTML strings.
(() => {
  const dataEl = document.getElementById("report-data");
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent);

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
    return n;
  }
  const pct = (v) => `${Math.round(v * 100)}%`;
  const num = (v) => v.toLocaleString("en-US");
  const usd = (v) => (v >= 100 ? `$${num(Math.round(v))}` : `$${v.toFixed(2)}`);
  const times = (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} times`;
  let uid = 0;
  const id = (p) => `ix-${p}-${++uid}`;
  const sr = (text) => el("span", { class: "sr", text });

  // A group of radio buttons drawn as pills.
  function pills(legend, options, value, onChange) {
    const name = id("pills");
    return el("fieldset", { class: "pills" }, el("legend", { class: "ix-legend", text: legend }),
      options.map(([v, label]) => el("label", { class: "pill" },
        el("input", { type: "radio", name, value: v, checked: v === value, onchange: (e) => onChange(e.target.value) }),
        el("span", { text: label }))));
  }

  // One horizontal bar with its value beside it.
  function bar(cls, who) {
    const fill = el("div", { class: `bfill ${cls}` });
    const val = el("span", { class: "bval" });
    const node = el("div", { class: "btrack" }, el("div", { class: "bbar" }, fill), el("span", { class: "bvalwrap" }, sr(`${who}: `), val));
    return { node, set(frac, text) { fill.style.width = `${Math.max(0.5, Math.min(1, frac) * 100)}%`; val.textContent = text; } };
  }

  // Finding 2: clear against vague criteria, per criterion, on a metric the reader chooses.
  function explorer() {
    const metrics = {
      kappa: { label: "Kappa", max: 1, get: (c) => c.kappa, fmt: (v) => v.toFixed(2),
        note: "Agreement beyond chance with the answer key. 1 is perfect, 0 is no better than chance." },
      rate: { label: "Agreement", max: 1, get: (c) => c.rate, fmt: pct,
        note: "Share of verdicts that match the answer key, pass or fail. It looks less alarming than kappa, because most replies pass most criteria." },
      over: { label: "Wrongly failed", max: D.replies, get: (c) => c.overFailed, fmt: num,
        note: `Verdicts where the judge failed a reply the answer key passes, out of ${num(D.replies)} replies. This is the mistake catch rate can't see.` },
    };
    const rows = D.criteria.map((c) => {
      const g = bar("bar-good", "Clear criteria"), v = bar("bar-vague", "Vague criteria");
      const node = el("div", { class: "brow" },
        el("div", { class: "blab" }, el("strong", { text: c.name }), el("span", { class: "sub", text: `vague: “${c.vague}”` })),
        el("div", { class: "bpair" }, g.node, v.node));
      return { c, g, v, node };
    });
    const note = el("p", { class: "ix-note", "aria-live": "polite" });
    function draw(metric) {
      const m = metrics[metric];
      for (const r of rows) {
        const gv = m.get(D.good[r.c.id]), vv = m.get(D.vague[r.c.id]);
        r.g.set(gv / m.max, m.fmt(gv));
        r.v.set(vv / m.max, m.fmt(vv));
      }
      note.textContent = m.note;
    }
    const fig = el("figure", { class: "chart ix-chart", "data-ix-chart": "explorer" },
      pills("Show", Object.entries(metrics).map(([k, m]) => [k, m.label]), "kappa", draw),
      el("div", { class: "bars" }, rows.map((r) => r.node)),
      note,
      el("figcaption", {}, el("span", { class: "key key-good" }), "Clear criteria ", el("span", { class: "key key-vague" }), `Vague criteria · all ${num(D.replies)} replies`));
    draw("kappa");
    return fig;
  }

  // Finding 3: step through label counts and watch each criterion's range narrow.
  function labels() {
    const steps = D.labelsNeeded, R = D.rule;
    const inputId = id("labels");
    const input = el("input", { type: "range", id: inputId, min: 0, max: steps.length - 1, step: 1, value: 0 });
    const out = el("p", { class: "ix-out", "aria-live": "polite" });
    const rows = D.criteria.map((c) => {
      const band = el("div", { class: "lband" }), dot = el("div", { class: "ldot" });
      const status = el("span", { class: "lstatus" }), detail = el("span", { class: "ldetail" });
      const node = el("div", { class: "lrow" },
        el("div", { class: "lhead" }, el("strong", { text: c.name }), status),
        el("div", { class: "ltrack", "aria-hidden": "true" }, band, dot),
        detail);
      return { c, band, dot, status, detail, node };
    });
    function draw(i) {
      const s = steps[i];
      let ok = 0;
      for (const r of rows) {
        const x = s.byCriterion[r.c.id];
        if (x.decidable) ok++;
        r.node.classList.toggle("ok", x.decidable);
        r.band.style.left = `${x.low * 100}%`;
        r.band.style.width = `${(x.high - x.low) * 100}%`;
        r.dot.style.setProperty("--f", String(x.heldBackFailures ? x.caught / x.heldBackFailures : 0));
        r.status.textContent = x.decidable ? "Can decide"
          : x.heldBackFailures < R.minFailures ? `Too few failures (${x.heldBackFailures} of ${R.minFailures} needed)`
          : `Range too wide (${Math.round(x.width * 100)} points)`;
        r.detail.textContent = `${x.caught} of ${x.heldBackFailures} held-back failures caught · likely ${pct(x.low)} to ${pct(x.high)}`;
      }
      out.textContent = `${num(s.labels)} replies labelled, ${num(s.heldBack)} held back: ${ok} of ${rows.length} criteria can be decided.`;
      input.setAttribute("aria-valuetext", `${s.labels} replies labelled`);
    }
    input.addEventListener("input", () => draw(Number(input.value)));
    const fig = el("figure", { class: "chart ix-chart", "data-ix-chart": "labels" },
      el("label", { class: "ix-legend", for: inputId, text: "Replies labelled" }),
      input,
      el("div", { class: "lticks", "aria-hidden": "true" }, steps.map((s) => el("span", { text: num(s.labels) }))),
      out,
      el("div", { class: "laxis", "aria-hidden": "true" }, el("span", { text: "0%" }), el("span", { text: "50%" }), el("span", { text: "100%" })),
      rows.map((r) => r.node),
      el("figcaption", {}, `The band is the likely range of the judge's catch rate on held-back failures; the dot is the measured rate. A criterion can be decided with at least ${R.minFailures} held-back failures and a band no wider than ${Math.round(R.maxWidth * 100)} points.`));
    draw(0);
    return fig;
  }

  // The conclusion: the cheapest model that clears the bars the reader ticks, and what it costs.
  function picker() {
    const B = D.bars, order = ["haiku", "sonnet", "opus"];
    const bars = [
      { on: true, label: `Catches at least ${pct(B.caught)} of planted failures`, test: (m) => m.caught.k / m.caught.n >= B.caught, show: (m) => `${m.caught.k} of ${m.caught.n} caught` },
      { on: true, label: `Passes at least ${pct(B.clean)} of clean replies`, test: (m) => m.cleanPassed.k / m.cleanPassed.n >= B.clean, show: (m) => `${m.cleanPassed.k} of ${m.cleanPassed.n} clean passed` },
      { on: true, label: "Never changes a verdict because of a hidden instruction", test: (m) => m.flips === 0, show: (m) => `${m.flips} of ${m.injectionPairs} verdicts changed` },
      { on: false, label: `Kappa of at least ${B.kappaOptional.toFixed(2)} (stricter; not one of my bars)`, test: (m) => m.kappa >= B.kappaOptional, show: (m) => `kappa ${m.kappa.toFixed(2)}` },
    ];
    const volumes = [1000, 10000, 100000, 1000000];
    let vol = 1;
    const checks = el("fieldset", { class: "checks" }, el("legend", { class: "ix-legend", text: "Bars the judge must clear" }),
      bars.map((b) => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: b.on, onchange: (e) => { b.on = e.target.checked; draw(); } }),
        el("span", { text: b.label }))));
    const volId = id("vol");
    const volOut = el("output", { for: volId });
    const volInput = el("input", { type: "range", id: volId, min: 0, max: volumes.length - 1, step: 1, value: vol,
      oninput: (e) => { vol = Number(e.target.value); draw(); } });
    const result = el("p", { class: "ix-out", "aria-live": "polite" });
    const cards = order.map((k) => {
      const m = D.models[k];
      const chip = el("span", { class: "chip pick", text: "Your pick" });
      const cost = el("p", { class: "mcost" });
      const costBar = el("div", { class: "bbar" }, el("div", { class: "bfill bar-good" }));
      const list = el("ul", { class: "mbars" });
      const node = el("div", { class: "mcard" }, el("p", { class: "mname" }, el("strong", { text: m.label }), " ", chip), cost, costBar, list);
      return { k, m, node, chip, cost, fill: costBar.firstChild, list };
    });
    function draw() {
      const v = volumes[vol];
      volOut.textContent = `${num(v)} replies a month`;
      volInput.setAttribute("aria-valuetext", `${num(v)} replies a month`);
      const active = bars.filter((b) => b.on);
      const passing = cards.filter((c) => active.every((b) => b.test(c.m))).sort((a, b) => a.m.costPerReply - b.m.costPerReply);
      const pick = passing[0];
      const max = Math.max(...cards.map((c) => c.m.costPerReply));
      for (const c of cards) {
        const ok = active.every((b) => b.test(c.m));
        c.node.classList.toggle("is-pick", c === pick);
        c.node.classList.toggle("is-out", !ok);
        c.chip.hidden = c !== pick;
        c.cost.replaceChildren(el("strong", { text: usd(c.m.costPerReply * v) }), " a month");
        c.fill.style.width = `${Math.max(0.5, (c.m.costPerReply / max) * 100)}%`;
        c.list.replaceChildren(...(active.length ? active.map((b) => {
          const pass = b.test(c.m);
          return el("li", { class: pass ? "yes" : "no" }, el("span", { class: "mark-ic", "aria-hidden": "true", text: pass ? "✓" : "✗" }), sr(pass ? "Clears: " : "Misses: "), b.show(c.m));
        }) : [el("li", { class: "none", text: "No bars ticked" })]));
      }
      if (!pick) result.textContent = "No model clears every bar you ticked.";
      else {
        const next = passing[1];
        result.textContent = `Your pick: ${pick.m.label}, ${usd(pick.m.costPerReply * v)} a month.` +
          (next ? ` ${next.m.label} also clears your bars, at ${times(next.m.costPerReply / pick.m.costPerReply)} the cost.` : "");
      }
    }
    draw();
    return el("figure", { class: "chart ix-chart", "data-ix-chart": "picker" },
      checks,
      el("div", { class: "vol" }, el("label", { class: "ix-legend", for: volId, text: "Replies graded" }), volInput, volOut),
      result,
      el("div", { class: "mcards" }, cards.map((c) => c.node)),
      el("figcaption", {}, "All three models were judged on the same replies with the clear criteria. Cost is the measured API fee per reply for all four criteria."));
  }

  // You be the judge: three real replies, each graded on one criterion, then the reveal.
  function quiz() {
    let answered = 0, matched = 0;
    const judgeMatched = D.quiz.filter((q) => q.judge === q.key).length;
    const score = el("p", { class: "ix-out", "aria-live": "polite", text: `Answered 0 of ${D.quiz.length}.` });
    const word = (v) => (v === "pass" ? "Pass" : "Fail");
    function replyText(q) {
      const i = q.reply.indexOf(q.quote);
      const p = el("p", { class: "ex-text reply" });
      if (i < 0) p.textContent = q.reply;
      else p.append(q.reply.slice(0, i), el("span", { class: "q-mark", text: q.quote }), q.reply.slice(i + q.quote.length));
      return p;
    }
    const cards = D.quiz.map((q, n) => {
      const reply = replyText(q);
      const result = el("div", { class: "q-result", tabindex: "-1", hidden: true });
      const buttons = ["pass", "fail"].map((v) => el("button", { type: "button", class: `q-btn q-${v}`, "aria-pressed": "false", onclick: () => answer(v), text: word(v) }));
      function answer(v) {
        for (const b of buttons) { b.disabled = true; b.setAttribute("aria-pressed", String(b.textContent === word(v))); }
        const mark = reply.querySelector(".q-mark");
        if (mark) mark.classList.add("on");
        const youOk = v === q.key, judgeOk = q.judge === q.key;
        result.replaceChildren(
          el("ul", { class: "q-lines" },
            el("li", {}, "You: ", el("span", { class: `v v-${v}`, text: word(v) }), youOk ? " · matches the answer key" : " · differs from the answer key"),
            el("li", {}, "Answer key: ", el("span", { class: `v v-${q.key}`, text: word(q.key) })),
            el("li", {}, "AI judge: ", el("span", { class: `v v-${q.judge}`, text: word(q.judge) }), judgeOk ? " · right" : " · wrong")),
          el("p", { class: "ex-quote", text: `“${q.quote}”` }),
          el("p", { class: "ex-reason", text: `The judge's reason: ${q.reason}` }),
          el("p", { class: "small", text: q.note }),
          n + 1 < D.quiz.length ? el("button", { type: "button", class: "q-btn q-next", text: "Next reply", onclick: () => {
            cards[n].hidden = true;
            cards[n + 1].hidden = false;
            cards[n + 1].querySelector(".q-h").focus();
          } }) : null);
        result.hidden = false;
        answered++;
        if (youOk) matched++;
        score.textContent = answered < D.quiz.length ? `Answered ${answered} of ${D.quiz.length}.`
          : `You matched the answer key on ${matched} of ${D.quiz.length}. The AI judge matched it on ${judgeMatched} of ${D.quiz.length}.`;
        result.focus();
      }
      return el("div", { class: "ex q-card", hidden: n > 0 },
        el("h3", { class: "q-h", tabindex: "-1", text: `Reply ${n + 1} of ${D.quiz.length}: ${q.criterion}` }),
        el("p", { class: "small" }, el("strong", { text: "Passes if: " }), q.definition),
        el("p", { class: "ex-who", text: "Customer" }), el("p", { class: "ex-text cust", text: q.customer }),
        el("p", { class: "ex-who", text: "Reply being judged" }), reply,
        el("div", { class: "q-ask", role: "group", "aria-label": `Your verdict on ${q.criterion}` }, el("span", { class: "ix-legend", text: "Your verdict:" }), buttons),
        result);
    });
    return el("div", { class: "quiz" }, cards, score);
  }

  const mounts = { explorer, labels, picker, quiz };
  for (const node of document.querySelectorAll("[data-ix]")) {
    const make = mounts[node.dataset.ix];
    if (!make) continue;
    try { node.replaceChildren(make()); } catch (e) { console.error(e); continue; }
    const wrap = node.closest(".ix-only");
    if (wrap) wrap.hidden = false;
  }
})();
