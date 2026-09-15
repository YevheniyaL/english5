/*
  Проверка русского перевода во вкладке «Слушай и переводи» (все уроки).
  RuAnswer.check(ввод, перевод, [варианты]) → true / false.
  - не различает регистр и е/ё, не смотрит на знаки препинания и лишние пробелы;
  - засчитывает перевод целиком, перевод без скобок и то, что в скобках
    («театр (драмкружок)» → «театр», «драмкружок»);
  - если перевод — список через запятую или «/» из коротких слов
    («нравиться, любить»), засчитывает каждое слово; фразы вроде «Хорошо, спасибо.»
    не делятся — «хорошо» отдельно не засчитается;
  - третий аргумент — дополнительные варианты (синонимы, «вы» вместо «ты» и т.п.).
*/
(function () {
  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[.,!?…;:"'«»()\[\]—–]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function variants(ru) {
    var s = String(ru);
    var noParens = s.replace(/\([^)]*\)/g, " ");
    var out = [s, noParens];
    (s.match(/\(([^)]*)\)/g) || []).forEach(function (x) { out.push(x.slice(1, -1)); });
    var isPhrase = /[.!?]\s*$/.test(noParens.trim());
    var parts = noParens.split(/[,\/;]/);
    var shortParts = parts.every(function (p) { return norm(p).split(" ").length <= 2; });
    if (!isPhrase && parts.length > 1 && shortParts) {
      parts.forEach(function (p) { out.push(p); });
    }
    return out;
  }

  function check(value, ru, alt) {
    var v = norm(value);
    if (!v) return false;
    var all = variants(ru).concat(alt || []);
    for (var i = 0; i < all.length; i++) {
      if (norm(all[i]) === v) return true;
    }
    return false;
  }

  window.RuAnswer = { norm: norm, check: check };
})();
