"use strict";

(() => {
  const navigation = document.querySelector(".navigation");
  const mobile = window.matchMedia("(max-width: 760px)");
  const updateNavigation = () => { navigation.open = !mobile.matches; };
  updateNavigation();
  mobile.addEventListener("change", updateNavigation);
  navigation.addEventListener("click", (event) => {
    if (mobile.matches && event.target.closest("a")) navigation.open = false;
  });

  const printButton = document.querySelector(".print-button");
  printButton.hidden = false;
  printButton.addEventListener("click", () => window.print());

  const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const search = document.querySelector(".search");
  const input = document.querySelector("#search-input");
  const results = document.querySelector("#search-results");
  const list = document.querySelector("#search-list");
  const status = document.querySelector("#search-status");
  const entries = [];

  document.querySelectorAll(".chapter").forEach((chapter) => {
    const title = chapter.querySelector("h2").textContent;
    entries.push({ id: chapter.id, title, section: "Chương tài liệu", text: title, normalized: normalize(title) });
    const prose = chapter.querySelector(".prose");
    let current = { id: chapter.id, title: "Giới thiệu", section: title, text: "" };
    const commit = () => {
      if (current.text.trim()) entries.push({ ...current, normalized: normalize(`${current.section} ${current.title} ${current.text}`) });
    };
    for (const element of prose.children) {
      if (/^H[3-6]$/.test(element.tagName)) {
        commit();
        current = { id: element.id, title: element.textContent, section: title, text: "" };
      } else {
        current.text += ` ${element.textContent.replace(/\s+/g, " ").trim()}`;
      }
    }
    commit();
  });

  const renderResults = () => {
    const query = normalize(input.value.trim());
    list.replaceChildren();
    if (!query) { results.hidden = true; status.textContent = ""; return; }
    const words = query.split(/\s+/);
    const matches = entries.filter((entry) => words.every((word) => entry.normalized.includes(word)));
    results.hidden = false;
    status.textContent = matches.length ? `${matches.length} mục phù hợp${matches.length > 8 ? " · hiện 8 mục đầu" : ""}` : "Không tìm thấy. Thử từ khóa ngắn hơn, như MQTT, nhịp tim hoặc outbox.";
    matches.slice(0, 8).forEach((entry) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${entry.id}`;
      const section = document.createElement("small");
      section.textContent = entry.section;
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const snippet = document.createElement("span");
      const position = Math.max(0, normalize(entry.text).indexOf(words[0]) - 35);
      snippet.textContent = `${position ? "…" : ""}${entry.text.slice(position, position + 130).trim()}${entry.text.length > position + 130 ? "…" : ""}`;
      link.append(section, title, snippet);
      link.addEventListener("click", () => {
        results.hidden = true;
        const target = document.getElementById(entry.id);
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
      li.append(link);
      list.append(li);
    });
  };
  search.hidden = false;
  input.addEventListener("input", renderResults);
  input.addEventListener("focus", renderResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !results.hidden) {
      const first = list.querySelector("a");
      if (first) { event.preventDefault(); first.focus(); }
    }
  });
  search.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!results.hidden) list.querySelector("a")?.click();
  });
  document.addEventListener("click", (event) => {
    if (!search.contains(event.target)) results.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    const editing = event.target.matches("input, textarea, select, [contenteditable='true']");
    if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); input.focus();
    }
    if (event.key === "Escape" && search.contains(document.activeElement)) {
      input.value = ""; renderResults(); input.focus();
    }
  });

  const navLinks = Array.from(document.querySelectorAll("nav a[href^='#']"));
  const sections = Array.from(document.querySelectorAll("[data-nav]"));
  let scheduled = false;
  const highlightSection = () => {
    const active = [...sections].reverse().find((section) => section.getBoundingClientRect().top <= 145) || sections[0];
    navLinks.forEach((link) => {
      if (link.hash === `#${active.id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    scheduled = false;
  };
  window.addEventListener("scroll", () => {
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(highlightSection); }
  }, { passive: true });
  highlightSection();
})();
