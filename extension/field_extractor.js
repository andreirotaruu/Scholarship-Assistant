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

  const INSTRUCTION_TEXT = [
    /select option\.?(?: use backspace or delete key to clear selection\.?)?/gi,
    /use (?:the )?(?:up|down|left|right|arrow|backspace|delete|enter|escape) key[^.]*\.?/gi,
    /press (?:enter|escape|space)[^.]*\.?/gi,
  ];

  function cleanLabel(value) {
    let label = String(value || "");
    INSTRUCTION_TEXT.forEach((pattern) => { label = label.replace(pattern, " "); });
    return label.replace(/\s+/g, " ").trim();
  }

  function autocompleteLabel(element) {
    const token = (element.getAttribute("autocomplete") || "").split(/\s+/).at(-1);
    return {
      "given-name": "First name",
      "additional-name": "Middle name or initial",
      "family-name": "Last name",
      email: "Email address",
      tel: "Phone number",
      "street-address": "Street address",
      "address-line1": "Street address",
      "address-line2": "Address line 2",
      "address-level2": "City",
      "address-level1": "State or province",
      "postal-code": "Postal code",
      country: "Country",
      "country-name": "Country",
      bday: "Date of birth",
    }[token] || "";
  }

  function structuredNameLabel(element) {
    const identifier = element.name || element.id || "";
    const suffixes = [
      [/(?:^|[._-])line1$/i, "Street address"],
      [/(?:^|[._-])line2$/i, "Address line 2"],
      [/(?:^|[._-])city$/i, "City"],
      [/(?:^|[._-])(?:state|province)$/i, "State or province"],
      [/(?:^|[._-])(?:postal|postcode|zipcode|zip)$/i, "Postal code"],
      [/(?:^|[._-])country$/i, "Country"],
    ];
    return suffixes.find(([pattern]) => pattern.test(identifier))?.[1] || "";
  }

  function ancestorLabel(element) {
    let current = element.parentElement;
    const form = element.closest("form, [role='form']");
    for (let depth = 0; current && current !== form && depth < 6; depth += 1, current = current.parentElement) {
      const candidates = Array.from(current.querySelectorAll("label, legend, [data-label], [id$='-label'], [id$='_label']"))
        .filter((candidate) => !candidate.contains(element))
        .map((candidate) => cleanLabel(candidate.textContent))
        .filter(Boolean);
      const unique = [...new Set(candidates)];
      if (unique.length === 1) return unique[0];
    }
    return "";
  }

  function generatedIdentifier(value) {
    return /^react-select-\d+-input$/i.test(value)
      || /^[a-z0-9]{16,}(?:[._-][a-z0-9]+)*$/i.test(value);
  }

  function labelFor(element) {
    const group = element.closest("[role='group'], fieldset");
    const groupLabelledBy = group?.getAttribute("aria-labelledby");
    if (element.type === "radio" && groupLabelledBy) {
      const groupText = groupLabelledBy.split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText.trim())
        .filter(Boolean)
        .join(" ");
      if (groupText) return cleanLabel(groupText);
    }
    if (element.type === "radio") {
      const legend = group?.querySelector("legend");
      if (cleanLabel(legend?.textContent)) return cleanLabel(legend.textContent);
    }
    if (element.labels?.length) {
      const form = element.closest("form");
      const labels = Array.from(element.labels)
        .filter((label) => !form || label.closest("form") === form)
        .map((label) => cleanLabel(label.innerText))
        .filter(Boolean);
      if (labels.length) return labels.join(" ");
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (cleanLabel(ariaLabel)) return cleanLabel(ariaLabel);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => cleanLabel(document.getElementById(id)?.innerText)).filter(Boolean).join(" ");
      if (text) return text;
    }
    const semanticLabel = autocompleteLabel(element) || structuredNameLabel(element) || ancestorLabel(element);
    if (semanticLabel) return semanticLabel;
    const container = element.closest("fieldset, .form-group, .field, .upload-group, [role='group']");
    const nearby = container?.querySelector("legend, label, .label, [data-label]");
    const fallback = cleanLabel(nearby?.textContent) || cleanLabel(element.placeholder) || cleanLabel(element.name) || cleanLabel(element.id);
    return generatedIdentifier(fallback) ? "" : fallback;
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
    }).map((element, index) => ({ element, index, label: labelFor(element) }))
      .filter(({ element, label }) => label || ["submit", "button", "reset", "image"].includes(element.type))
      .map(({ element, index, label }) => ({
        field_id: element.id || element.name || `field_${index}`,
        label,
        type: element.getAttribute("role") === "combobox" && !(element instanceof HTMLSelectElement)
          ? "combobox"
          : element instanceof HTMLTextAreaElement
            ? "textarea"
            : element instanceof HTMLSelectElement
              ? "select"
              : element.type || element.tagName.toLowerCase(),
        required: element.required || element.getAttribute("aria-required") === "true",
        options: optionsFor(element),
        max_length: element.maxLength > 0 ? element.maxLength : null,
        selector: selectorFor(element, index),
        placeholder: element.placeholder || null
      }));
  };
})();
