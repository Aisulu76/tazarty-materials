(function () {
  "use strict";

  const STORAGE_KEY = "tazartyMaterials";
  const DISTRICTS = ["Есиль", "Сарыарка", "Алматы", "Байконур", "Нура"];
  const MAIN_PROJECT = "Тазарту";

  /** @type {Array<Object>} */
  let records = loadRecords();
  let editingId = null;

  // ---------- Storage ----------

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Не удалось прочитать данные из LocalStorage", e);
      return [];
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  // ---------- Helpers ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function remainder(rec) {
    return num(rec.issued) - num(rec.used);
  }

  function statusFor(rec) {
    const r = remainder(rec);
    if (r < 0) return { cls: "status-red", label: "Использовано больше" };
    if (r === 0) return { cls: "status-gray", label: "Остаток = 0" };
    if (num(rec.used) > 0) return { cls: "status-yellow", label: "Частично использован" };
    return { cls: "status-green", label: "Материал есть" };
  }

  function fmt(n) {
    const v = num(n);
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function showStatus(msg) {
    const el = document.getElementById("status-message");
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3000);
  }

  // ---------- Filters ----------

  function getFilters() {
    return {
      project: document.getElementById("filter-project").value,
      district: document.getElementById("filter-district").value,
      material: document.getElementById("filter-material").value,
      responsible: document.getElementById("filter-responsible").value,
      date: document.getElementById("filter-date").value,
    };
  }

  function applyFilters(list) {
    const f = getFilters();
    return list.filter((r) => {
      if (f.project && r.project !== f.project) return false;
      if (f.district && r.district !== f.district) return false;
      if (f.material && r.material !== f.material) return false;
      if (f.responsible && r.responsible !== f.responsible) return false;
      if (f.date && r.date !== f.date) return false;
      return true;
    });
  }

  function populateFilterOptions() {
    fillSelectOptions("filter-project", uniqueValues("project"));
    fillSelectOptions("filter-district", DISTRICTS);
    fillSelectOptions("filter-material", uniqueValues("material"));
    fillSelectOptions("filter-responsible", uniqueValues("responsible"));

    fillDatalist("project-list", uniqueValues("project"));
    fillDatalist("material-list", uniqueValues("material"));
  }

  function uniqueValues(field) {
    return Array.from(new Set(records.map((r) => r[field]).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "ru")
    );
  }

  function fillSelectOptions(selectId, values) {
    const select = document.getElementById(selectId);
    const current = select.value;
    select.innerHTML = '<option value="">Все</option>';
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if (values.includes(current)) select.value = current;
  }

  function fillDatalist(id, values) {
    const dl = document.getElementById(id);
    dl.innerHTML = "";
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      dl.appendChild(opt);
    });
  }

  // ---------- Rendering ----------

  function renderAll() {
    populateFilterOptions();
    renderMainTable();
    renderSummary();
    renderDistricts();
  }

  function renderMainTable() {
    const tbody = document.getElementById("main-table-body");
    const empty = document.getElementById("main-table-empty");
    const filtered = applyFilters(records);

    tbody.innerHTML = "";
    empty.style.display = filtered.length ? "none" : "block";

    filtered.forEach((rec) => {
      const st = statusFor(rec);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(rec.project)}</td>
        <td>${escapeHtml(rec.district)}</td>
        <td>${escapeHtml(rec.area)}</td>
        <td>${escapeHtml(rec.material)}</td>
        <td>${escapeHtml(rec.unit)}</td>
        <td>${fmt(rec.total)}</td>
        <td>${fmt(rec.issued)}</td>
        <td>${fmt(rec.used)}</td>
        <td><span class="status-pill ${st.cls}">${fmt(remainder(rec))}</span></td>
        <td>${escapeHtml(rec.responsible)}</td>
        <td>${escapeHtml(rec.date)}</td>
        <td>${escapeHtml(rec.comment)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="icon-btn" data-action="edit" data-id="${rec.id}">Изм.</button>
            <button type="button" class="icon-btn" data-action="delete" data-id="${rec.id}">Удал.</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function aggregate(list) {
    const map = new Map();
    list.forEach((rec) => {
      const key = rec.material + "||" + rec.unit;
      if (!map.has(key)) {
        map.set(key, { material: rec.material, unit: rec.unit, total: 0, issued: 0, used: 0 });
      }
      const a = map.get(key);
      a.total += num(rec.total);
      a.issued += num(rec.issued);
      a.used += num(rec.used);
    });
    return Array.from(map.values());
  }

  function renderSummary() {
    const tbody = document.getElementById("summary-table-body");
    const tfoot = document.getElementById("summary-table-foot");
    const empty = document.getElementById("summary-table-empty");

    const tazartyRecords = records.filter((r) => r.project === MAIN_PROJECT);
    const rows = aggregate(tazartyRecords);

    tbody.innerHTML = "";
    empty.style.display = rows.length ? "none" : "block";

    let totalAll = 0, issuedAll = 0, usedAll = 0;

    rows.forEach((row) => {
      const rem = row.issued - row.used;
      const st = statusFor({ issued: row.issued, used: row.used });
      totalAll += row.total;
      issuedAll += row.issued;
      usedAll += row.used;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.material)}</td>
        <td>${escapeHtml(row.unit)}</td>
        <td>${fmt(row.total)}</td>
        <td>${fmt(row.issued)}</td>
        <td>${fmt(row.used)}</td>
        <td><span class="status-pill ${st.cls}">${fmt(rem)}</span></td>`;
      tbody.appendChild(tr);
    });

    tfoot.innerHTML = rows.length
      ? `<tr>
          <td colspan="2">Итого по проекту «Тазарту»</td>
          <td>${fmt(totalAll)}</td>
          <td>${fmt(issuedAll)}</td>
          <td>${fmt(usedAll)}</td>
          <td>${fmt(issuedAll - usedAll)}</td>
        </tr>`
      : "";
  }

  function renderDistricts() {
    const container = document.getElementById("districts-container");
    container.innerHTML = "";

    DISTRICTS.forEach((district) => {
      const districtRecords = records.filter(
        (r) => r.project === MAIN_PROJECT && r.district === district
      );
      const rows = aggregate(districtRecords);

      const card = document.createElement("div");
      card.className = "district-card";

      let bodyHtml = "";
      let totalIssued = 0, totalUsed = 0;

      rows.forEach((row) => {
        const rem = row.issued - row.used;
        const st = statusFor({ issued: row.issued, used: row.used });
        totalIssued += row.issued;
        totalUsed += row.used;
        bodyHtml += `
          <tr>
            <td>${escapeHtml(row.material)}</td>
            <td>${fmt(row.issued)}</td>
            <td>${fmt(row.used)}</td>
            <td><span class="status-pill ${st.cls}">${fmt(rem)}</span></td>
          </tr>`;
      });

      card.innerHTML = `
        <h3>${escapeHtml(district)}</h3>
        ${
          rows.length
            ? `<table>
                <thead><tr><th>Материал</th><th>Выдано</th><th>Использ.</th><th>Остаток</th></tr></thead>
                <tbody>${bodyHtml}</tbody>
                <tfoot><tr><td>Итого</td><td>${fmt(totalIssued)}</td><td>${fmt(totalUsed)}</td><td>${fmt(totalIssued - totalUsed)}</td></tr></tfoot>
              </table>`
            : `<p class="empty-note">Нет данных по району «${escapeHtml(district)}».</p>`
        }`;
      container.appendChild(card);
    });
  }

  // ---------- Form handling ----------

  function readForm() {
    return {
      project: document.getElementById("f-project").value.trim(),
      district: document.getElementById("f-district").value,
      area: document.getElementById("f-area").value.trim(),
      material: document.getElementById("f-material").value.trim(),
      unit: document.getElementById("f-unit").value.trim(),
      total: num(document.getElementById("f-total").value),
      issued: num(document.getElementById("f-issued").value),
      used: num(document.getElementById("f-used").value),
      responsible: document.getElementById("f-responsible").value.trim(),
      date: document.getElementById("f-date").value,
      comment: document.getElementById("f-comment").value.trim(),
    };
  }

  function clearForm() {
    document.getElementById("material-form").reset();
    document.getElementById("f-project").value = MAIN_PROJECT;
    document.getElementById("record-id").value = "";
    editingId = null;
    document.getElementById("submit-btn").textContent = "Добавить материал";
    document.getElementById("cancel-edit-btn").hidden = true;
  }

  function startEdit(id) {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;
    editingId = id;
    document.getElementById("record-id").value = id;
    document.getElementById("f-project").value = rec.project;
    document.getElementById("f-district").value = rec.district;
    document.getElementById("f-area").value = rec.area;
    document.getElementById("f-material").value = rec.material;
    document.getElementById("f-unit").value = rec.unit;
    document.getElementById("f-total").value = rec.total;
    document.getElementById("f-issued").value = rec.issued;
    document.getElementById("f-used").value = rec.used;
    document.getElementById("f-responsible").value = rec.responsible;
    document.getElementById("f-date").value = rec.date;
    document.getElementById("f-comment").value = rec.comment;

    document.getElementById("submit-btn").textContent = "Сохранить изменения";
    document.getElementById("cancel-edit-btn").hidden = false;
    document.getElementById("form-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteRecord(id) {
    if (!confirm("Удалить эту запись?")) return;
    records = records.filter((r) => r.id !== id);
    persist();
    renderAll();
    showStatus("Запись удалена.");
  }

  // ---------- CSV export ----------

  function exportCsv() {
    const headers = [
      "Проект", "Район", "Участок", "Материал", "Ед. измерения",
      "Кол-во всего", "Выдано", "Использовано", "Остаток",
      "Ответственный", "Дата", "Комментарий",
    ];
    const lines = [headers.join(",")];

    records.forEach((rec) => {
      const row = [
        rec.project, rec.district, rec.area, rec.material, rec.unit,
        fmt(rec.total), fmt(rec.issued), fmt(rec.used), fmt(remainder(rec)),
        rec.responsible, rec.date, rec.comment,
      ].map(csvEscape);
      lines.push(row.join(","));
    });

    const csvContent = "﻿" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tazarty-materials-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus("CSV файл экспортирован.");
  }

  function csvEscape(value) {
    const str = String(value ?? "");
    if (/[",\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // ---------- Event wiring ----------

  document.getElementById("material-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readForm();

    if (!data.district) {
      alert("Выберите район.");
      return;
    }

    if (editingId) {
      const idx = records.findIndex((r) => r.id === editingId);
      if (idx !== -1) records[idx] = { ...records[idx], ...data };
      showStatus("Запись обновлена.");
    } else {
      records.push({ id: uid(), ...data });
      showStatus("Материал добавлен.");
    }

    persist();
    clearForm();
    renderAll();
  });

  document.getElementById("cancel-edit-btn").addEventListener("click", clearForm);

  document.getElementById("main-table-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") startEdit(id);
    if (btn.dataset.action === "delete") deleteRecord(id);
  });

  ["filter-project", "filter-district", "filter-material", "filter-responsible", "filter-date"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderMainTable);
    document.getElementById(id).addEventListener("change", renderMainTable);
  });

  document.getElementById("reset-filters-btn").addEventListener("click", () => {
    document.getElementById("filter-project").value = "";
    document.getElementById("filter-district").value = "";
    document.getElementById("filter-material").value = "";
    document.getElementById("filter-responsible").value = "";
    document.getElementById("filter-date").value = "";
    renderMainTable();
  });

  document.getElementById("export-csv-btn").addEventListener("click", exportCsv);

  document.getElementById("save-btn").addEventListener("click", () => {
    persist();
    showStatus("Данные сохранены в браузере.");
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    if (!confirm("Удалить ВСЕ данные без возможности восстановления?")) return;
    records = [];
    persist();
    renderAll();
    showStatus("Все данные очищены.");
  });

  // ---------- Init ----------

  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
  renderAll();
})();
