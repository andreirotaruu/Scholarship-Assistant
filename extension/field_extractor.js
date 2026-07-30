(() => {
  const ScholarSafe = globalThis.ScholarSafe || (globalThis.ScholarSafe = {});

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function selectorFor(element, index) {
    if (element.id) return `#${cssEscape(element.id)}`;
    if (element.name) {
      const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
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
      return Array.from(element.labels).map((label) => label.innerText.trim()).filter(Boolean).join(" ");
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText.trim()).filter(Boolean).join(" ");
      if (text) return text;
    }
    const container = element.closest("fieldset, .form-group, .field, [role='group']");
    const nearby = container?.querySelector("legend, label, .label, [data-label]");
    return nearby?.textContent?.trim() || element.placeholder || element.name || element.id || "";
  }

  function optionsFor(element) {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => option.text.trim()).filter(Boolean);
    }
    if (element.type === "radio" && element.name) {
      return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
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
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  ScholarSafe.extractFields = function extractFields() {
    const controls = Array.from(document.querySelectorAll("input, textarea, select, button"));
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
