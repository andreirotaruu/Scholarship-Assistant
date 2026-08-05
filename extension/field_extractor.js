(() => {
  const ScholarSafe = globalThis.ScholarSafe || (globalThis.ScholarSafe = {});

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function selectorFor(element, index) {
    const root = element.closest("form, [role='form']");
    const rootSelector = root?.id && document.querySelectorAll(`#${cssEscape(root.id)}`).length === 1
      ? `#${cssEscape(root.id)}`
      : null;
    if (element.id) {
      const idSelector = `#${cssEscape(element.id)}`;
      if (document.querySelectorAll(idSelector).length === 1) return idSelector;
      if (rootSelector && root.querySelectorAll(idSelector).length === 1) return `${rootSelector} ${idSelector}`;
    }
    if (element.name) {
      const selector = `${element.tagName.toLowerCase()}[name="${cssEscape(element.name)}"]`;
      const searchRoot = root || document;
      if (searchRoot.querySelectorAll(selector).length === 1) return rootSelector ? `${rootSelector} ${selector}` : selector;
    }
    element.dataset.scholarSafeField = String(index);
    return `[data-scholar-safe-field="${index}"]`;
  }

  function labelFor(element) {
    const group = element.closest("[role='group'], fieldset");
    const groupLabelledBy = group?.getAttribute("aria-labelledby");
    if (element.type === "radio" && groupLabelledBy) {
      const groupText = groupLabelledBy.split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText.trim())
        .filter(Boolean)
        .join(" ");
      if (groupText) return groupText;
    }
    if (element.type === "radio") {
      const legend = group?.querySelector("legend");
      if (legend?.textContent?.trim()) return legend.textContent.trim();
    }
    if (element.labels?.length) {
      const form = element.closest("form");
      const labels = Array.from(element.labels)
        .filter((label) => !form || label.closest("form") === form)
        .map((label) => label.innerText.trim())
        .filter(Boolean);
      if (labels.length) return labels.join(" ");
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText.trim()).filter(Boolean).join(" ");
      if (text) return text;
    }
    const container = element.closest("fieldset, .form-group, .field, .upload-group, [role='group']");
    const nearby = container?.querySelector("legend, label, .label, [data-label]");
    return nearby?.textContent?.trim() || element.placeholder || element.name || element.id || "";
  }

  function optionsFor(element) {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => option.text.trim()).filter(Boolean);
    }
    if (element.type === "radio" && element.name) {
      const root = element.closest("form, [role='form']") || document;
      return Array.from(root.querySelectorAll(`input[type="radio"][name="${cssEscape(element.name)}"]`))
        .map((radio) => {
          const ownLabel = radio.labels?.length
            ? Array.from(radio.labels).map((label) => label.innerText.trim()).filter(Boolean).join(" ")
            : "";
          return ownLabel || radio.value;
        })
        .filter(Boolean);
    }
    return [];
  }

  function visible(element) {
    if (element.type === "hidden") return false;
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return false;
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return false;
      current = current.parentElement;
    }
    return true;
  }

  function scoreForm(form) {
    const controls = Array.from(form.querySelectorAll("input, textarea, select, button"));
    if (!controls.length) return Number.NEGATIVE_INFINITY;
    const identity = [
      form.id,
      form.className,
      form.getAttribute("name"),
      form.getAttribute("action"),
      form.getAttribute("aria-label"),
      (form.innerText || "").slice(0, 600),
    ].filter(Boolean).join(" ").toLowerCase();
    const positive = /(scholar|application|grant|award|financial aid)/.test(identity) ? 30 : 0;
    const negative = /(sign[ -]?in|log[ -]?in|register|subscribe|newsletter|search|contact|donat|cart)/.test(identity) ? 35 : 0;
    const required = controls.filter((control) => control.required || control.getAttribute("aria-required") === "true").length;
    const evidenceControls = controls.filter((control) => control.type === "file" || control instanceof HTMLTextAreaElement).length;
    return controls.length + required * 2 + evidenceControls * 4 + positive - negative;
  }

  function applicationRoot() {
    const candidates = Array.from(document.querySelectorAll("form, [role='form']"));
    const ranked = candidates.map((form) => ({ form, score: scoreForm(form) })).sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 12 ? ranked[0].form : null;
  }

  ScholarSafe.extractFields = function extractFields() {
    const root = applicationRoot();
    if (!root) return [];
    const controls = Array.from(root.querySelectorAll("input, textarea, select, button"));
    const seenRadioGroups = new Set();
    return controls.filter((element) => {
      if (!visible(element)) return false;
      if (element.type !== "radio" || !element.name) return true;
      if (seenRadioGroups.has(element.name)) return false;
      seenRadioGroups.add(element.name);
      return true;
    }).map((element, index) => ({
      field_id: element.id || element.name || `field_${index}`,
      label: labelFor(element),
      type: element instanceof HTMLTextAreaElement ? "textarea" : element instanceof HTMLSelectElement ? "select" : element.type || element.tagName.toLowerCase(),
      required: element.required || element.getAttribute("aria-required") === "true",
      options: optionsFor(element),
      max_length: element.maxLength > 0 ? element.maxLength : null,
      selector: selectorFor(element, index),
      placeholder: element.placeholder || null
    }));
  };
})();
