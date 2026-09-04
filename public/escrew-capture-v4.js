(() => {
  const findById = (value, id) => {
    if (Array.isArray(value)) {
      for (const item of value) { const found = findById(item, id); if (found) return found; }
      return undefined;
    }
    if (!value || typeof value !== 'object') return undefined;
    if (value.id === id) return value;
    for (const item of Object.values(value)) { const found = findById(item, id); if (found) return found; }
    return undefined;
  };

  const balancedJson = (source, start) => {
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return '';
  };

  const parseInitialResult = (source) => {
    const marker = /var\s+initialResult\s*=/m.exec(source);
    if (!marker) return undefined;
    const start = source.indexOf('{', marker.index + marker[0].length);
    if (start < 0) return undefined;
    const json = balancedJson(source, start);
    if (!json) return undefined;
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch { return undefined; }
  };

  const documentSource = (doc) => {
    try {
      const scripts = Array.from(doc.scripts || []).map((script) => script.textContent || '').join('\n');
      if (/var\s+initialResult\s*=/.test(scripts)) return scripts;
    } catch {}
    try { return doc.documentElement ? doc.documentElement.innerHTML : ''; }
    catch { return ''; }
  };

  const collectDocuments = () => {
    const docs = [], seen = new Set();
    const visit = (doc) => {
      if (!doc || seen.has(doc)) return;
      seen.add(doc); docs.push(doc);
      let frames = [];
      try { frames = Array.from(doc.querySelectorAll('iframe,frame')); } catch {}
      for (const frame of frames) {
        try { if (frame.contentDocument) visit(frame.contentDocument); } catch {}
      }
    };
    visit(document);
    return docs;
  };

  const quotedAssignment = (source, key) => {
    const prefixes = ["localStorage['" + key + "']", 'localStorage["' + key + '"]'];
    for (const prefix of prefixes) {
      const pos = source.indexOf(prefix);
      if (pos < 0) continue;
      const equals = source.indexOf('=', pos + prefix.length);
      if (equals < 0) continue;
      let i = equals + 1;
      while (i < source.length && /\s/.test(source[i])) i += 1;
      const quote = source[i];
      if (quote !== "'" && quote !== '"') continue;
      let out = '', escaped = false;
      for (i += 1; i < source.length; i += 1) {
        const ch = source[i];
        if (escaped) { out += ch; escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) return out;
        out += ch;
      }
    }
    return '';
  };

  const readPeriod = (source, root, doc, key) => {
    const direct = root && typeof root[key] === 'string' ? root[key] : '';
    if (direct) return direct;
    const embedded = quotedAssignment(source, key);
    if (embedded) return embedded;
    try { return doc.defaultView?.localStorage?.getItem(key) || ''; } catch { return ''; }
  };

  const findSource = () => {
    let best;
    for (const doc of collectDocuments()) {
      const source = documentSource(doc);
      if (!source || !/var\s+initialResult\s*=/.test(source)) continue;
      const root = parseInitialResult(source);
      if (!root) continue;
      let score = 0;
      try { if (/\/eCrew\/CrewSchedule\/?$/i.test(doc.location?.pathname || '')) score += 20; } catch {}
      if (Array.isArray(root.SchedulerEvents)) score += 10 + Math.min(root.SchedulerEvents.length, 5);
      if (root.elementList && typeof root.elementList === 'object') score += 6;
      if (findById(root.elementList, 'members')) score += 3;
      if (!best || score > best.score) best = { doc, source, root, score };
    }
    return best;
  };

  const encodeBase64Url = (text) => {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const body = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return 'b64.' + bytes.length + '.' + body;
  };

  const capture = () => {
    const found = findSource();
    if (!found) return undefined;
    const { doc, source, root } = found;
    const rawEvents = Array.isArray(root.SchedulerEvents) ? root.SchedulerEvents : [];
    if (!rawEvents.length) return undefined;

    const eventKeys = [
      'start','end','report','debrief','type','text','details','location','IsDeadhead',
      'HotelInfo','HotelNo','Memo','Notification','RequiredRest','NoContact','ReplaceGDO',
      'WillingToFly','barHidden','calendar','charterer','color','date_sort','delay','id',
      'invert_times','legs','open','resource','sort','ver','aircraftType','AircraftType',
      'aircraft','Aircraft','acType','ACType'
    ];
    const events = rawEvents.map((event) => {
      const out = {};
      if (!event || typeof event !== 'object') return out;
      for (const key of eventKeys) if (Object.prototype.hasOwnProperty.call(event, key)) out[key] = event[key];
      return out;
    });

    const membersElement = findById(root.elementList, 'members');
    const memberGroups = (membersElement && Array.isArray(membersElement.data) ? membersElement.data : []).map((group) => [
      typeof group.value === 'string' ? group.value : '',
      (Array.isArray(group.data) ? group.data : []).map((member) => [
        typeof member.value2 === 'string' ? member.value2 : '',
        (typeof member.value3 === 'string' || typeof member.value3 === 'number') ? member.value3 : '',
        typeof member.value4 === 'string' ? member.value4 : '',
        typeof member.value5 === 'string' ? member.value5 : ''
      ])
    ]);

    const hotelsElement = findById(root.elementList, 'hotels');
    const hotels = (hotelsElement && Array.isArray(hotelsElement.data) ? hotelsElement.data : []).map((row) => [
      typeof row.port === 'string' ? row.port : '',
      typeof row.phones === 'string' ? row.phones : '',
      typeof row.addresses === 'string' ? row.addresses : '',
      typeof row.locators === 'string' ? row.locators : ''
    ]);

    const hoursElement = findById(root.elementList, 'hours');
    const totals = (hoursElement && Array.isArray(hoursElement.data) ? hoursElement.data : []).map((row) => [
      typeof row.desc === 'string' ? row.desc : '',
      typeof row.hours === 'string' ? row.hours : ''
    ]);

    const periodStart = readPeriod(source, root, doc, 'PeriodStart');
    const periodEnd = readPeriod(source, root, doc, 'PeriodEnd');
    if (!periodStart || !periodEnd) return undefined;

    const payload = { v: 1, p: [periodStart, periodEnd], e: events, m: memberGroups, h: hotels, t: totals };
    const encoded = encodeBase64Url(JSON.stringify(payload));
    if (encoded.length > 90000) throw new Error('Roster capture is unexpectedly large. Use Import saved roster in eScrew.');
    return 'https://rbozzhanov-web.github.io/eScrew/#aims-shortcut=' + encoded;
  };

  const result = capture();
  if (!result) throw new Error('Could not read embedded Crew Schedule data from this Safari page. Open Crew Schedule and run eScrew Capture from Share.');
  completion(result);
})();
