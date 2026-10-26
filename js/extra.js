/*
  Доп. английский — общий движок страниц extra/*.html (данные темы — window.TOPIC,
  страницы строит scripts/english/gen_extra.py).
  - В заданиях на написание слово на экране не показывается (звук или русский перевод).
  - Вставлять текст нельзя, подсказки и автоисправление клавиатуры выключены.
  - Пока идёт задание, другие вкладки (и карточки) закрыты; уход со страницы считается.
  - Ошибся — слово возвращается в конец задания, пока не будет написано верно.
  - История попыток и «трудные слова» — localStorage этого браузера.
*/
(function () {
  "use strict";
  var T = window.TOPIC;
  var HIST = "edu5_en_extra_hist", HARD = "edu5_en_extra_hard_" + T.id;
  var canSpeak = !!window.speechSynthesis;

  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function speak(text, slow) {
    try {
      if (!canSpeak) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = slow ? 0.6 : 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function ruWords(n) { return n % 10 === 1 && n % 100 !== 11 ? "слово" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "слова" : "слов"); }
  function ruTimes(n) { return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "раза" : "раз"; }
  function mmss(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m ? m + " мин " + s + " с" : s + " с"; }

  /* Сравнение английского ответа: "ok", "case" (верно, кроме большой буквы) или "no" */
  function normEn(s) { return String(s).replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, ""); }
  function variantsEn(a) {
    var out = [a];
    if (T.theMy) out.push(a.replace(/\bthe\b/g, "my"), a.replace(/\bmy\b/g, "the"));
    if (T.optA) out.slice().forEach(function (x) { out.push(/^an? /.test(x) ? x.replace(/^an? /, "") : "a " + x); });
    return out;
  }
  function cmpEn(val, answers, cs) {
    var v = normEn(val), res = "no";
    answers.forEach(function (a) {
      variantsEn(normEn(a)).forEach(function (x) {
        if (res === "ok") return;
        if (v.toLowerCase() === x.toLowerCase()) res = (!cs || v === x) ? "ok" : "case";
      });
    });
    return res;
  }

  /* Поле ввода без вставки, подсказок и автоисправления */
  function guardInput(inp, onBlocked) {
    ["autocomplete", "autocorrect", "autocapitalize"].forEach(function (a) { inp.setAttribute(a, "off"); });
    inp.setAttribute("spellcheck", "false");
    inp.name = "w" + Math.random().toString(36).slice(2);
    ["paste", "drop", "contextmenu"].forEach(function (ev) {
      inp.addEventListener(ev, function (e) { e.preventDefault(); onBlocked(); });
    });
    inp.addEventListener("beforeinput", function (e) {
      if (/^insertFrom|^insertReplacementText/.test(e.inputType || "")) { e.preventDefault(); onBlocked(); }
    });
  }

  /* Трудные слова: +1 за ошибку, −1 за верный ответ с первой попытки */
  function hardAdd(key, d) {
    if (!WORD[key]) return;
    var m = load(HARD, {});
    m[key] = (m[key] || 0) + d;
    if (m[key] <= 0) delete m[key];
    save(HARD, m);
  }

  var WORD = {};
  T.words.forEach(function (w) { WORD[w.en] = w; });

  /* ---------- вкладки и замок на время задания ---------- */
  var busy = null;           // задание, которое сейчас идёт
  var all = [];              // все задания страницы (для автотеста)
  var tabsNav = document.getElementById("tabs");
  var main = document.getElementById("sections");
  var onShow = {};
  function addTab(id, title) {
    var b = h("button", "tab", esc(title));
    b.type = "button"; b.setAttribute("role", "tab"); b.dataset.target = id;
    b.setAttribute("aria-selected", tabsNav.children.length ? "false" : "true");
    tabsNav.appendChild(b);
    var s = h("section", "page" + (tabsNav.children.length === 1 ? " active" : ""));
    s.id = id; main.appendChild(s);
    return s;
  }
  tabsNav.addEventListener("click", function (e) {
    var tab = e.target.closest(".tab"); if (!tab) return;
    if (busy && busy.sec.id !== tab.dataset.target) { busy.flash(); return; }
    tabsNav.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", t === tab ? "true" : "false"); });
    main.querySelectorAll("section.page").forEach(function (s) { s.classList.toggle("active", s.id === tab.dataset.target); });
    if (onShow[tab.dataset.target]) onShow[tab.dataset.target]();
  });

  var awayNow = false;
  function goneAway() { if (busy && !awayNow) { awayNow = true; busy.away++; busy.renderCounter(); } }
  document.addEventListener("visibilitychange", function () { if (document.hidden) goneAway(); else awayNow = false; });
  window.addEventListener("blur", goneAway);
  window.addEventListener("focus", function () { awayNow = false; });
  window.addEventListener("pagehide", function () { if (busy) busy.finish(false); });

  /* ---------- общая оболочка задания ---------- */
  function Shell(sec, name, lead) {
    this.sec = sec; this.name = name;
    if (lead) sec.appendChild(h("p", "lead", lead));
    this.notice = sec.appendChild(h("p", "notice")); this.notice.hidden = true;
    this.startBox = sec.appendChild(h("div", "start-box"));
    this.run = sec.appendChild(h("div", "run")); this.run.hidden = true;
    this.res = sec.appendChild(h("div", "result")); this.res.hidden = true;
    this.counter = this.run.appendChild(h("p", "counter"));
    this.box = this.run.appendChild(h("div", "qbox"));
    var stop = this.run.appendChild(h("div", "reset-line", '<button class="reset-btn" type="button">прервать задание</button>'));
    var self = this;
    stop.querySelector("button").addEventListener("click", function () { self.finish(false); });
    all.push(this);
  }
  Shell.prototype.say = function (text, cls) {
    var n = this.notice, self = this;
    n.textContent = text; n.className = "notice" + (cls ? " " + cls : ""); n.hidden = false;
    clearTimeout(this._nt); this._nt = setTimeout(function () { n.hidden = true; }, 4000);
    void self;
  };
  Shell.prototype.flash = function () {
    this.say("Сначала закончи задание или нажми «прервать задание». Пока идёт задание, карточки и другие вкладки закрыты.");
  };
  Shell.prototype.showStart = function (n, label) {
    var self = this;
    this.startBox.innerHTML = "";
    this.startBox.hidden = false; this.run.hidden = true;
    var b = h("button", "big-btn", esc(label || "Начать") + " — " + n + " " + ruWords(n));
    b.type = "button"; b.disabled = !n;
    b.addEventListener("click", function () { self.begin(); });
    this.startBox.appendChild(b);
  };
  Shell.prototype.open = function () {
    busy = this; this.away = 0; this.errors = 0; this.first = 0; this.hints = 0;
    this.mistakes = {}; this.t0 = Date.now();
    this.startBox.hidden = true; this.res.hidden = true; this.run.hidden = false; this.notice.hidden = true;
  };
  Shell.prototype.renderCounter = function () {
    var s = "Верно: " + this.first + " из " + this.total + " · Ошибок: " + this.errors;
    if (this.left != null) s += " · Осталось: " + this.left;
    this.counter.innerHTML = esc(s) + (this.away ? ' <span class="away">· ⚠ уходил со страницы: ' + this.away + "</span>" : "");
  };
  Shell.prototype.miss = function (key) {
    this.errors++;
    this.mistakes[key] = (this.mistakes[key] || 0) + 1;
  };
  Shell.prototype.finish = function (done) {
    if (busy !== this) return;
    busy = null;
    var sec = Math.round((Date.now() - this.t0) / 1000);
    var wrong = Object.keys(this.mistakes);
    this.run.hidden = true;
    if (!done && this.first + this.errors === 0) { this.afterFinish(); return; }   // ничего не начал — не записываем
    var st = { t: Date.now(), topic: T.id, title: T.title, task: this.name, total: this.total, first: this.first,
               errors: this.errors, sec: sec, away: this.away, hints: this.hints, done: done, wrong: wrong };
    var hist = load(HIST, []); hist.push(st); save(HIST, hist.slice(-300));
    var pct = this.total ? Math.round(100 * this.first / this.total) : 0;
    var head = !done ? "Задание прервано" : pct >= 90 ? "Отлично! 🎉" : pct >= 70 ? "Хорошо! 👍" : "Нужно ещё потренироваться 💪";
    var html = '<h3 class="res-head">' + head + "</h3><ul class=\"res-list\">" +
      "<li>Верно с первой попытки: <b>" + this.first + " из " + this.total + "</b> (" + pct + " %)</li>" +
      "<li>Ошибок: <b>" + this.errors + "</b></li>" +
      "<li>Время: " + mmss(sec) + "</li>" +
      (this.hints ? "<li>Подсказок: " + this.hints + "</li>" : "") +
      (this.away ? '<li class="away">⚠ Уходил со страницы: ' + this.away + " " + ruTimes(this.away) + " — мог подсматривать</li>" : "") +
      "</ul>" +
      (wrong.length ? '<p class="res-wrong">Ошибки были: ' + wrong.map(function (k) {
        return "<b>" + esc(k) + "</b>" + (this.mistakes[k] > 1 ? " ×" + this.mistakes[k] : "");
      }, this).join(", ") + "</p>" : "") +
      '<div class="res-btns"></div>';
    this.res.innerHTML = html; this.res.hidden = false;
    var btns = this.res.querySelector(".res-btns"), self = this;
    if (wrong.length && this.retryWrong) {
      var b1 = h("button", "big-btn", "Ещё раз — только ошибки"); b1.type = "button";
      b1.addEventListener("click", function () { self.retryWrong(); });
      btns.appendChild(b1);
    }
    var b2 = h("button", "big-btn soft", "Начать заново"); b2.type = "button";
    b2.addEventListener("click", function () { self.res.hidden = true; self.begin(); });
    btns.appendChild(b2);
    this.afterFinish();
  };
  Shell.prototype.afterFinish = function () { this.showStart(this.count(), this.label); };

  /* ---------- задание с очередью вопросов: ввод / выбор / буквы ---------- */
  // cfg: name, lead, kind ("type" | "choice" | "tiles"), items() → [{key, prompt, answers, cs, show, say, check, options, hint, target}], hard
  function Runner(sec, cfg) {
    Shell.call(this, sec, cfg.name, cfg.lead);
    this.cfg = cfg; this.label = cfg.label;
    if (cfg.needSpeech && !canSpeak) sec.insertBefore(h("p", "notice warn", "В этом браузере нет озвучки — это задание здесь не получится."), this.startBox);
    this.afterFinish();
  }
  Runner.prototype = Object.create(Shell.prototype);
  Runner.prototype.count = function () { return this.cfg.items().length; };
  Runner.prototype.begin = function (subset) {
    var items = subset || this.cfg.items();
    if (!items.length) return;
    items.forEach(function (it, i) { it.id = i; });
    this.items = items;
    this.open();
    this.queue = shuffled(items); this.failed = {};
    this.total = items.length;
    this.next();
  };
  Runner.prototype.retryWrong = function () {
    var f = this.failed;
    this.res.hidden = true;
    this.begin(this.items.filter(function (it) { return f[it.id]; }).map(function (it) { return Object.assign({}, it); }));
  };
  Runner.prototype.next = function () {
    this.left = this.queue.length; this.renderCounter();
    if (!this.queue.length) { this.finish(true); return; }
    var it = this.cur = this.queue[0], self = this;
    this.answered = false;
    this.box.innerHTML = '<div class="q-prompt">' + it.prompt + "</div>";
    this.box.querySelectorAll("[data-say]").forEach(function (b) {
      b.addEventListener("click", function () { speak(it.say, b.dataset.say === "slow"); if (self.input) self.input.focus(); });
    });
    this.box.querySelectorAll("[data-hint]").forEach(function (b) {
      b.addEventListener("click", function () { b.outerHTML = '<span class="hint-shown">' + esc(it.hint) + "</span>"; self.hints++; if (self.input) self.input.focus(); });
    });
    this.input = null;
    this["show_" + this.cfg.kind](it);
    this.fb = this.box.appendChild(h("div", "feedback"));
    if (it.say && it.autoSay !== false) speak(it.say);
  };
  Runner.prototype.right = function () {
    var it = this.cur, self = this;
    this.answered = true;
    if (!this.failed[it.id]) { this.first++; if (this.cfg.hard) hardAdd(it.key, -1); }
    this.fb.className = "feedback good"; this.fb.textContent = "верно!";
    this.queue.shift(); this.left = this.queue.length; this.renderCounter();
    setTimeout(function () { if (busy === self && self.cur === it) self.next(); }, 700);
  };
  Runner.prototype.wrong = function (msg) {
    var it = this.cur, self = this;
    this.answered = true;
    this.miss(it.key);
    if (!this.failed[it.id] && this.cfg.hard) hardAdd(it.key, 1);
    this.failed[it.id] = true;
    this.queue.push(this.queue.shift());
    this.renderCounter();
    this.fb.className = "feedback bad"; this.fb.innerHTML = msg;
    var nx = h("button", "check-btn next-btn", "Дальше →"); nx.type = "button";
    nx.addEventListener("click", function () { self.next(); });
    this.fb.appendChild(nx); nx.focus();
  };

  Runner.prototype.show_type = function (it) {
    var self = this;
    var row = this.box.appendChild(h("div", "q-row"));
    var inp = this.input = h("input", "q-input"); inp.type = "text";
    if (it.placeholder) inp.placeholder = it.placeholder;
    guardInput(inp, function () { self.say("Вставлять нельзя — напиши сам 🙂", "warn"); });
    row.appendChild(inp);
    var btn = h("button", "check-btn", "Проверить"); btn.type = "button"; row.appendChild(btn);
    function check() {
      if (self.answered || !inp.value.trim()) return;
      var r = it.check ? (it.check(inp.value) ? "ok" : "no") : cmpEn(inp.value, it.answers, it.cs);
      inp.disabled = true; btn.disabled = true;
      if (r === "ok") { inp.classList.add("correct"); self.right(); return; }
      inp.classList.add("incorrect");
      self.wrong((r === "case" ? "Почти! Нужна <b>большая буква</b>. " : "Ошибка. ") +
        "Правильно: <b>" + esc(it.show) + "</b>" + (r === "case" ? "" : ' <span class="yours">у тебя: <s>' + esc(inp.value.trim()) + "</s></span>") +
        (it.hint && it.hintOnWrong ? '<br><span class="hint-shown">' + esc(it.hint) + "</span>" : "") + " ");
    }
    btn.addEventListener("click", check);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); check(); } });
    setTimeout(function () { inp.focus(); }, 30);
  };

  Runner.prototype.show_choice = function (it) {
    var self = this, wrap = this.box.appendChild(h("div", "choices"));
    shuffled(it.options).forEach(function (o) {
      var b = h("button", "choice", esc(o)); b.type = "button"; b.dataset.v = o;
      b.addEventListener("click", function () {
        if (self.answered) return;
        wrap.querySelectorAll(".choice").forEach(function (x) { x.disabled = true; });
        if (o === it.answer) { b.classList.add("good"); self.right(); return; }
        b.classList.add("bad");
        wrap.querySelector('[data-v="' + CSS.escape(it.answer) + '"]').classList.add("good");
        self.wrong("Ошибка. Правильно: <b>" + esc(it.answer) + "</b>" + (it.hint ? '<br><span class="hint-shown">' + esc(it.hint) + "</span>" : "") + " ");
      });
      wrap.appendChild(b);
    });
  };

  Runner.prototype.show_tiles = function (it) {
    var self = this, target = it.target, pos = 0, missed = 0, streak = 0;
    var built = this.box.appendChild(h("div", "built"));
    var tiles = this.box.appendChild(h("div", "tiles"));
    function skipSpaces() { while (pos < target.length && target[pos] === " ") pos++; }
    function draw() {
      var s = "";
      for (var i = 0; i < target.length; i++) s += target[i] === " " ? '<span class="gap"></span>' : (i < pos ? '<span class="ok">' + esc(target[i]) + "</span>" : '<span class="slot">_</span>');
      built.innerHTML = s;
    }
    skipSpaces(); draw();
    shuffled(target.replace(/ /g, "").split("")).forEach(function (ch) {
      var b = h("button", "tile", esc(ch)); b.type = "button"; b.dataset.ch = ch;
      b.addEventListener("click", function () {
        if (self.answered || b.disabled) return;
        if (ch === target[pos]) {
          b.disabled = true; b.classList.add("used"); pos++; streak = 0; skipSpaces(); draw();
          tiles.querySelectorAll(".tile.blink").forEach(function (x) { x.classList.remove("blink"); });
          if (pos >= target.length) {
            if (!missed) self.right();
            else self.wrong("Слово собрано: <b>" + esc(target) + "</b>, но с ошибками (" + missed + "). Оно ещё вернётся. ");
          }
          return;
        }
        missed++; streak++;
        self.errors++; self.mistakes[it.key] = (self.mistakes[it.key] || 0) + 1;
        if (missed === 1 && self.cfg.hard) hardAdd(it.key, 1);
        self.renderCounter();
        b.classList.add("wrong"); setTimeout(function () { b.classList.remove("wrong"); }, 350);
        if (streak >= 2) {
          var need = tiles.querySelector('.tile:not(:disabled)[data-ch="' + CSS.escape(target[pos]) + '"]');
          if (need) need.classList.add("blink");
        }
      });
      tiles.appendChild(b);
    });
  };
  // у «Собери слово» ошибки считаются по каждой неверной букве; wrong() не должен считать их ещё раз
  var baseWrong = Runner.prototype.wrong;
  Runner.prototype.wrong = function (msg) {
    if (this.cfg.kind === "tiles") {
      var it = this.cur, self = this;
      this.answered = true; this.failed[it.id] = true;
      this.queue.push(this.queue.shift()); this.renderCounter();
      this.fb.className = "feedback bad"; this.fb.innerHTML = msg;
      var nx = h("button", "check-btn next-btn", "Дальше →"); nx.type = "button";
      nx.addEventListener("click", function () { self.next(); });
      this.fb.appendChild(nx); nx.focus();
      return;
    }
    baseWrong.call(this, msg);
  };

  /* ---------- Найди пару: раунды по 8 пар ---------- */
  function Match(sec) {
    Shell.call(this, sec, "Найди пару", "Нажми на английское слово, потом на его перевод. Пары идут порциями по 8.");
    this.label = "Начать"; this.afterFinish();
  }
  Match.prototype = Object.create(Shell.prototype);
  Match.prototype.count = function () { return T.words.length; };
  Match.prototype.begin = function () {
    this.open(); this.total = T.words.length; this.done = 0; this.left = null;
    this.order = shuffled(T.words); this.round = 0; this.drawRound();
  };
  Match.prototype.renderCounter = function () {
    this.counter.innerHTML = esc("Пары: " + this.done + " из " + this.total + " · Ошибок: " + this.errors) +
      (this.away ? ' <span class="away">· ⚠ уходил со страницы: ' + this.away + "</span>" : "");
  };
  Match.prototype.drawRound = function () {
    var self = this, part = this.order.slice(this.round * 8, this.round * 8 + 8);
    if (!part.length) { this.first = this.total - Object.keys(this.mistakes).length; this.finish(true); return; }
    this.renderCounter();
    this.box.innerHTML = '<div class="match-grid"><div class="match-col"></div><div class="match-col"></div></div>';
    var cols = this.box.querySelectorAll(".match-col"), sel = { en: null, ru: null }, lock = false, got = 0;
    function pick(b, side, w) {
      if (lock || b.classList.contains("matched")) return;
      if (sel[side]) sel[side].b.classList.remove("selected");
      sel[side] = { b: b, w: w }; b.classList.add("selected");
      if (!sel.en || !sel.ru) return;
      if (sel.en.w === sel.ru.w) {
        [sel.en.b, sel.ru.b].forEach(function (x) { x.classList.remove("selected"); x.classList.add("matched"); });
        sel = { en: null, ru: null }; self.done++; got++; self.renderCounter();
        if (got === part.length) { self.round++; setTimeout(function () { if (busy === self) self.drawRound(); }, 500); }
      } else {
        lock = true; self.miss(sel.en.w.en); self.renderCounter();
        var a = sel.en.b, c = sel.ru.b; a.classList.add("wrong"); c.classList.add("wrong");
        setTimeout(function () { a.classList.remove("selected", "wrong"); c.classList.remove("selected", "wrong"); sel = { en: null, ru: null }; lock = false; }, 500);
      }
    }
    shuffled(part).forEach(function (w) {
      var b = h("button", "chip", esc(w.en)); b.type = "button";
      b.addEventListener("click", function () { pick(b, "en", w); }); cols[0].appendChild(b);
    });
    shuffled(part).forEach(function (w) {
      var b = h("button", "chip", esc(w.ru)); b.type = "button";
      b.addEventListener("click", function () { pick(b, "ru", w); }); cols[1].appendChild(b);
    });
  };

  /* ---------- Расставь по порядку ---------- */
  // task: name, lead, seq: [[подходящие на место 1], [на место 2], …], labels (подписи мест, необязательно)
  function Order(sec, task) {
    Shell.call(this, sec, task.title, task.lead);
    this.task = task; this.label = "Начать"; this.afterFinish();
  }
  Order.prototype = Object.create(Shell.prototype);
  Order.prototype.count = function () { return this.task.seq.length; };
  Order.prototype.begin = function () {
    var self = this, seq = this.task.seq, labels = this.task.labels || [], pos = 0;
    this.open(); this.total = seq.length; this.left = seq.length; this.renderCounter();
    var pool = [];
    seq.forEach(function (acc) { acc.forEach(function (x) { if (pool.indexOf(x) < 0) pool.push(x); }); });
    this.box.innerHTML = '<ol class="order-list"></ol><div class="pool"></div>';
    var list = this.box.querySelector(".order-list"), poolEl = this.box.querySelector(".pool"), missedHere = {};
    seq.forEach(function (_, i) { list.appendChild(h("li", "slot-li", '<span class="lbl">' + esc(labels[i] || "") + "</span> <span class=\"val\">…</span>")); });
    shuffled(pool).forEach(function (x) {
      var b = h("button", "chip", esc(x)); b.type = "button";
      b.addEventListener("click", function () {
        if (seq[pos].indexOf(x) >= 0) {
          list.children[pos].querySelector(".val").textContent = x; list.children[pos].classList.add("filled");
          if (!missedHere[pos]) self.first++;
          b.remove(); pos++; self.left = seq.length - pos; self.renderCounter();
          if (pos >= seq.length) setTimeout(function () { self.finish(true); }, 600);
        } else {
          missedHere[pos] = true; self.miss(x); self.renderCounter();
          b.classList.add("wrong"); setTimeout(function () { b.classList.remove("wrong"); }, 350);
        }
      });
      poolEl.appendChild(b);
    });
  };

  /* ---------- сборка страницы ---------- */
  function sayBtns(hint) {
    return '<button class="listen-btn" type="button" data-say="1">🔊 Слушай</button> ' +
      '<button class="listen-btn" type="button" data-say="slow">🐢 Медленно</button>' +
      (hint ? ' <button class="hint-btn" type="button" data-hint="1">подсказка</button>' : "");
  }
  function spellOf(w) { return [w.en].concat(w.spell || []); }

  // Карточки
  var cs = addTab("cards", "Карточки");
  cs.innerHTML = '<p class="lead">Нажми на карточку — увидишь перевод. 🔈 — послушать.</p>' +
    (T.print ? '<a class="print-link" href="' + T.print + '" target="_blank" rel="noopener">Распечатать карточки →</a>' : "") +
    '<div class="cards" id="cardsGrid"></div>';
  T.words.forEach(function (w) {
    var card = h("div", "card" + (w.en.length > 16 || w.ru.length > 26 ? " long" : ""));
    card.innerHTML = '<div class="card-inner"><div class="card-face front">' +
      '<button class="speak-btn" type="button" title="озвучить" aria-label="озвучить">&#128266;</button>' +
      '<span class="en">' + esc(w.en) + '</span></div><div class="card-face back"><span class="ru">' + esc(w.ru) + "</span></div></div>";
    card.querySelector(".card-inner").addEventListener("click", function (e) { if (!e.target.classList.contains("speak-btn")) card.classList.toggle("flipped"); });
    card.querySelector(".speak-btn").addEventListener("click", function (e) { e.stopPropagation(); speak(w.say || w.en); });
    cs.querySelector("#cardsGrid").appendChild(card);
  });

  new Match(addTab("match", "Найди пару"));

  new Runner(addTab("listen", "Слушай и переводи"), {
    name: "Слушай и переводи", kind: "type", needSpeech: true,
    lead: "Слушай слово по-английски и напиши перевод <b>по-русски</b>. Ошибся — слово вернётся в конце.",
    items: function () {
      return T.words.map(function (w) {
        return { key: w.en, say: w.say || w.en, prompt: sayBtns(false), placeholder: "перевод по-русски", show: w.ru,
                 check: function (v) { return RuAnswer.check(v, w.ru, w.ruAlt); } };
      });
    }
  });

  new Runner(addTab("tiles", "Собери слово"), {
    name: "Собери слово", kind: "tiles", hard: true,
    lead: "Нажимай буквы по порядку — собери английское слово. Каждая неверная буква — ошибка.",
    items: function () {
      return T.words.map(function (w) {
        return { key: w.en, target: w.en, say: w.say || w.en, autoSay: false,
                 prompt: '<span class="ru-big">' + esc(w.tr || w.ru) + '</span> <button class="listen-btn" type="button" data-say="1">🔊</button>' };
      });
    }
  });

  (T.tasks || []).forEach(function (task, ti) {
    var sec = addTab("x" + ti, task.tab);
    if (task.type === "order") { new Order(sec, task); return; }
    new Runner(sec, {
      name: task.title, kind: task.type, hard: task.type === "type", lead: task.lead,
      items: function () {
        return task.items.map(function (q) {
          var p = '<span class="q-text">' + esc(q.q).replace(/___/g, '<span class="blank">___</span>') + "</span>";
          if (task.type === "choice") return { key: q.key || q.a, prompt: p, options: q.o, answer: q.a, hint: q.hint };
          return { key: q.key || q.a, prompt: p, answers: [q.a].concat(q.alt || []), cs: !!q.cs, show: q.a,
                   hint: q.hint, hintOnWrong: true, placeholder: task.placeholder || "" };
        });
      }
    });
  });

  new Runner(addTab("dict", "Диктант"), {
    name: "Диктант", kind: "type", hard: true, needSpeech: true,
    lead: "Слушай слово и напиши его <b>по-английски</b>. Слова на экране нет. «Подсказка» покажет перевод (считается).",
    items: function () {
      return T.words.map(function (w) {
        return { key: w.en, say: w.say || w.en, prompt: sayBtns(true), hint: w.ru, answers: spellOf(w), cs: !!w.cs, show: w.en,
                 placeholder: "пиши по-английски" };
      });
    }
  });

  function trItems(words) {
    return words.map(function (w) {
      return { key: w.en, prompt: '<span class="ru-big">' + esc(w.tr || w.ru) + "</span>", answers: spellOf(w).concat(w.enAlt || []),
               cs: !!w.cs, show: w.en, placeholder: "по-английски" };
    });
  }
  new Runner(addTab("tr", "Переведи на английский"), {
    name: "Переведи на английский", kind: "type", hard: true,
    lead: "Читай слово по-русски и напиши его <b>по-английски</b>. Ошибся — слово вернётся в конце.",
    items: function () { return trItems(T.words); }
  });

  // Итоги
  var ss = addTab("stats", "Итоги");
  ss.innerHTML = '<div id="histBox"></div><h3 class="sub">Трудные слова</h3><p class="lead" id="hardLead"></p>';
  var hardRunner = new Runner(ss, {
    name: "Трудные слова", kind: "type", hard: true, label: "Тренировать трудные слова",
    lead: "", items: function () { return trItems(Object.keys(load(HARD, {})).filter(function (k) { return WORD[k]; }).map(function (k) { return WORD[k]; })); }
  });
  ss.appendChild(h("p", "lead", 'История хранится только в этом браузере. <a href="results.html">Все результаты по всем темам →</a>'));
  function drawStats() {
    var hist = load(HIST, []).filter(function (x) { return x.topic === T.id; }).slice(-10).reverse();
    var box = document.getElementById("histBox");
    if (!hist.length) { box.innerHTML = '<p class="lead">Попыток пока нет. Здесь появятся последние 10 попыток по этой теме.</p>'; }
    else {
      box.innerHTML = '<h3 class="sub">Последние попытки</h3><div class="hist-wrap"><table class="hist"><thead><tr><th>Когда</th><th>Задание</th><th>Верно</th><th>Ошибок</th><th>Время</th><th></th></tr></thead><tbody>' +
        hist.map(function (x) {
          var d = new Date(x.t), p = function (n) { return (n < 10 ? "0" : "") + n; };
          var pct = x.total ? Math.round(100 * x.first / x.total) : 0;
          return "<tr><td>" + p(d.getDate()) + "." + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + "</td><td>" + esc(x.task) +
            "</td><td>" + x.first + " из " + x.total + " (" + pct + "%)</td><td>" + x.errors + "</td><td>" + mmss(x.sec) + "</td><td>" +
            (x.done ? "" : "прервано ") + (x.away ? '<span class="away">⚠ уходил ' + x.away + "</span>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    var hard = load(HARD, {}), keys = Object.keys(hard).filter(function (k) { return WORD[k]; }).sort(function (a, b) { return hard[b] - hard[a]; });
    document.getElementById("hardLead").innerHTML = keys.length
      ? "Слова, в которых были ошибки (уходят из списка, когда пишешь их верно с первого раза): " + keys.map(function (k) { return "<b>" + esc(k) + "</b>" + (hard[k] > 1 ? " ×" + hard[k] : ""); }).join(", ")
      : "Пока трудных слов нет.";
    if (busy !== hardRunner) hardRunner.afterFinish();
  }
  onShow.stats = drawStats;
  var baseFinish = hardRunner.finish;
  hardRunner.finish = function (done) { baseFinish.call(this, done); drawStats(); };

  window.__EXTRA_TEST = { all: all, cmpEn: cmpEn, busy: function () { return busy; } };
})();
