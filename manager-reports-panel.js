(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const tokenKey = 'formaia-api-token';
  let report = null, loading = false, requestedRange = null, reportsView = false;
  const money = value => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 }).format(Number(value || 0));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const inputDate = daysAgo => { const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() - daysAgo); return value.toISOString().slice(0, 10); };
  const labels = { cash: 'Efectivo', bank_transfer: 'Transferencia', pos: 'POS', card: 'Tarjeta', online: 'En línea', adjustment: 'Ajuste' };
  const isManager = () => ['manager', 'branch_manager'].includes(window.FormaIAClientSession?.user?.()?.role);
  const api = async path => { const response = await fetch(`${apiUrl}${path}`, { cache: 'no-store', headers: { Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}` } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw Error(payload.error || 'No fue posible cargar el reporte.'); return payload; };
  const rows = (items, label) => items.length ? items.map(item => `<tr><td>${escape(item[label])}</td><td>${money(item.totalHnl)}</td><td>${item.transactions}</td></tr>`).join('') : '<tr><td colspan="3">Sin registros.</td></tr>';
  const xml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]));
  const column = index => { let value = ''; for (let current = index + 1; current; current = Math.floor((current - 1) / 26)) value = String.fromCharCode(65 + (current - 1) % 26) + value; return value; };
  const bytes = value => new TextEncoder().encode(value);
  const concat = chunks => { const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const output = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output; };
  const u16 = value => Uint8Array.of(value & 255, value >>> 8 & 255);
  const u32 = value => Uint8Array.of(value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255);
  const crc = value => { let current = 0xffffffff; for (const byte of value) { current ^= byte; for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? current >>> 1 ^ 0xedb88320 : current >>> 1; } return (current ^ 0xffffffff) >>> 0; };
  const zip = files => { let offset = 0; const locals = [], directory = []; for (const file of files) { const name = bytes(file.name), content = bytes(file.content), checksum = crc(content); locals.push(concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(content.length), u32(content.length), u16(name.length), u16(0), name, content])); directory.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(content.length), u32(content.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name])); offset += locals.at(-1).length; } const central = concat(directory); return concat([...locals, central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]); };
  const sheetXml = rows => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((cells, row) => `<row r="${row + 1}">${cells.map((value, cell) => Number.isFinite(value) ? `<c r="${column(cell)}${row + 1}"><v>${value}</v></c>` : `<c r="${column(cell)}${row + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const exportExcel = () => {
    if (!report) return;
    const methods = report.byMethod.map(item => [labels[item.method] || item.method, Number(item.totalHnl), Number(item.transactions)]);
    const branches = report.byBranch.map(item => [item.branchName, Number(item.totalHnl), Number(item.transactions)]);
    const sheets = [
      { name: 'Resumen', rows: [['Reporte de ingresos'], ['Período', `${report.range.from} a ${report.range.to}`], [], ['Ingresos totales (HNL)', Number(report.summary.totalHnl)], ['Pagos verificados', Number(report.summary.transactions)], ['Clientes que pagaron', Number(report.summary.customers)]] },
      { name: 'Ingresos diarios', rows: [['Fecha', 'Ingresos (HNL)', 'Pagos'], ...report.daily.map(item => [item.date, Number(item.totalHnl), Number(item.transactions)])] },
      { name: 'Métodos de pago', rows: [['Método', 'Ingresos (HNL)', 'Pagos'], ...methods] },
      { name: 'Sucursales', rows: [['Sucursal', 'Ingresos (HNL)', 'Pagos'], ...branches] }
    ];
    const files = [
      { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>` },
      ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheetXml(sheet.rows) }))
    ];
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); link.download = `reporte-ingresos-${report.range.from}-a-${report.range.to}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const render = mount => {
    const section = mount.querySelector('[data-manager-reports]');
    if (!section) return;
    if (loading) { section.innerHTML = '<div class="manager-income-empty">Cargando ingresos…</div>'; return; }
    if (!report) { section.innerHTML = '<div class="manager-income-empty">No fue posible cargar el reporte.</div>'; return; }
    const max = Math.max(...report.daily.map(item => item.totalHnl), 1);
    const chart = report.daily.length ? `<div class="manager-income-chart" aria-label="Ingresos diarios">${report.daily.map(item => `<span class="manager-income-bar" style="height:${Math.max(12, Math.round(item.totalHnl / max * 150))}px" data-label="${escape(date(item.date))}" title="${escape(date(item.date))}: ${escape(money(item.totalHnl))}"></span>`).join('')}</div>` : '<div class="manager-income-empty">No hay pagos verificados en este período.</div>';
    const methods = report.byMethod.map(item => ({ ...item, label: labels[item.method] || item.method }));
    const branches = report.byBranch.map(item => ({ ...item, label: item.branchName }));
    section.innerHTML = `<div class="manager-report-head"><div><span class="eyebrow">Control financiero</span><h2>Reportes de ingresos</h2><p>Solo se contabilizan pagos verificados.</p></div><form class="manager-report-range" data-manager-report-range><label>Desde<input name="from" type="date" value="${report.range.from}" required></label><label>Hasta<input name="to" type="date" value="${report.range.to}" required></label><button class="btn lime" type="submit">Actualizar</button></form></div><div class="admin-summary manager-report-summary"><article><b>${money(report.summary.totalHnl)}</b><span>ingresos del período</span></article><article><b>${report.summary.transactions}</b><span>pagos verificados</span></article><article><b>${report.summary.customers}</b><span>clientes que pagaron</span></article></div><section class="admin-catalog"><div><span class="eyebrow">Tendencia</span><h2>Ingresos por día</h2><p>${escape(date(report.range.from))} al ${escape(date(report.range.to))}</p></div>${chart}</section><div class="manager-report-breakdown"><section class="admin-catalog"><div><span class="eyebrow">Canales</span><h2>Por método de pago</h2></div><div class="admin-table-wrap"><table><thead><tr><th>Método</th><th>Ingresos</th><th>Pagos</th></tr></thead><tbody>${rows(methods, 'label')}</tbody></table></div></section><section class="admin-catalog"><div><span class="eyebrow">Sedes</span><h2>Por sucursal</h2></div><div class="admin-table-wrap"><table><thead><tr><th>Sucursal</th><th>Ingresos</th><th>Pagos</th></tr></thead><tbody>${rows(branches, 'label')}</tbody></table></div></section></div>`;
  };
  const installExportButton = mount => { const head = mount.querySelector('.manager-report-head'); if (head && !head.querySelector('[data-manager-report-export]')) head.insertAdjacentHTML('beforeend', '<button class="btn outline" type="button" data-manager-report-export>Exportar Excel</button>'); };
  const load = async (mount, range = requestedRange) => {
    if (!isManager() || !reportsView) return;
    loading = true; render(mount);
    const values = range || { from: inputDate(29), to: inputDate(0) }; requestedRange = values;
    try { report = await api(`/api/manager/reports/income?from=${encodeURIComponent(values.from)}&to=${encodeURIComponent(values.to)}`); }
    catch (error) { report = null; const toast = document.querySelector('#toast'); if (toast) { toast.textContent = error.message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800); } }
    finally { loading = false; render(mount); installExportButton(mount); }
  };
  const mount = target => {
    if (!isManager()) return;
    const tabs = target.querySelector('.admin-tabs');
    if (!tabs.querySelector('[data-admin-tab="reports"]')) tabs.insertAdjacentHTML('afterbegin', `<button role="tab" data-admin-tab="reports" data-manager-reports-tab aria-selected="${reportsView}">Reportes</button>`);
    else tabs.querySelector('[data-manager-reports-tab]')?.setAttribute('aria-selected', String(reportsView));
    if (!reportsView) { target.querySelector('[data-manager-reports]')?.remove(); return; }
    let section = target.querySelector('[data-manager-reports]');
    if (!section) { section = document.createElement('section'); section.className = 'admin-catalog manager-reports'; section.dataset.managerReports = ''; target.append(section); }
    if (report) { render(target); installExportButton(target); } else load(target);
  };
  document.addEventListener('submit', event => { const form = event.target.closest('[data-manager-report-range]'); if (!form) return; event.preventDefault(); const values = new FormData(form); const target = document.querySelector('[data-admin-panel]'); if (target) load(target, { from: String(values.get('from')), to: String(values.get('to')) }); });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-manager-report-export]')) { exportExcel(); return; }
    const tab = event.target.closest('[data-manager-reports-tab]');
    const otherTab = event.target.closest('[data-admin-tab]');
    if (tab) {
      reportsView = true;
      requestAnimationFrame(() => document.querySelectorAll('[data-admin-panel]').forEach(mount));
    } else if (otherTab) {
      reportsView = false;
      setTimeout(() => document.querySelectorAll('[data-admin-panel]').forEach(mount), 0);
    }
  }, true);
  window.FormaIAManagerReports = { mount };
  // Si el panel terminó de cargar antes que este archivo, instala la pestaña igual.
  setTimeout(() => document.querySelectorAll('[data-admin-panel]').forEach(mount), 0);
})();
