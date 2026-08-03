import fs from 'node:fs';
import path from 'node:path';

function walk(d) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

function strings(s) {
  const arr = [];
  for (let i = 0; i < s.length; i++) {
    const q = s[i];
    if (q === '"' || q === "'") {
      let j = i + 1;
      let out = '';
      let esc = false;
      for (; j < s.length && out.length < 1000; j++) {
        const c = s[j];
        if (esc) { out += c; esc = false; continue; }
        if (c === '\\') { esc = true; out += c; continue; }
        if (c === q) break;
        if (c === '\n' || c === '\r') break;
        out += c;
      }
      if (j < s.length && s[j] === q) { arr.push(out); i = j; }
    }
  }
  return arr;
}

const files = [...walk('_next'), ...walk('assets'), ...walk('zY')];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (!/supabase|api|auth|stripe|broadcast|document|storage|rpc/i.test(s)) continue;
  console.log('\n###', f, 'size', s.length);
  const strs = strings(s);
  for (const term of ['supabase','from','select','insert','update','delete','rpc','auth','storage','api','broadcast','documents','document','projects','teams','subscription','stripe','parts','share','clone','save','load']) {
    const hits = [...new Set(strs.filter(x => x.toLowerCase().includes(term)))];
    if (hits.length) {
      console.log('TERM', term, hits.length);
      for (const x of hits.slice(0, 60)) console.log(' ', JSON.stringify(x).slice(0, 500));
    }
  }
}
