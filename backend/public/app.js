// app.js
// Talks to OUR OWN backend (/api/execute, /api/history, /api/stats) --
// not to Judge0 directly. The backend proxies to Judge0, rate-limits,
// and records run history in SQLite.

const LANGUAGES = [
  { id:'javascript', label:'JavaScript', file:'main.js', mode:'javascript',
    starter: "console.log('Hello from JavaScript');\n\nconst nums = [1,2,3,4,5];\nconsole.log('Sum:', nums.reduce((a,b)=>a+b,0));" },
  { id:'typescript', label:'TypeScript', file:'main.ts', mode:'javascript',
    starter: "const greet = (name) => `Hello, ${name}!`;\nconsole.log(greet('TypeScript'));" },
  { id:'python', label:'Python', file:'main.py', mode:'python',
    starter: "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint('Hello from Python')\nprint('fib(10) =', fib(10))" },
  { id:'c', label:'C', file:'main.c', mode:'text/x-csrc',
    starter: "#include <stdio.h>\n\nint main() {\n    printf(\"Hello from C\\n\");\n    return 0;\n}" },
  { id:'cpp', label:'C++', file:'main.cpp', mode:'text/x-c++src',
    starter: "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello from C++\" << endl;\n    return 0;\n}" },
  { id:'java', label:'Java', file:'Main.java', mode:'text/x-java',
    starter: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from Java\");\n    }\n}" },
  { id:'csharp', label:'C#', file:'main.cs', mode:'text/x-csharp',
    starter: "using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(\"Hello from C#\");\n    }\n}" },
  { id:'go', label:'Go', file:'main.go', mode:'go',
    starter: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello from Go\")\n}" },
  { id:'rust', label:'Rust', file:'main.rs', mode:'rust',
    starter: "fn main() {\n    println!(\"Hello from Rust\");\n}" },
  { id:'ruby', label:'Ruby', file:'main.rb', mode:'ruby',
    starter: "puts 'Hello from Ruby'\n\n(1..5).each { |i| puts \"Line #{i}\" }" },
  { id:'php', label:'PHP', file:'main.php', mode:'php',
    starter: "<?php\necho \"Hello from PHP\\n\";\n" },
  { id:'bash', label:'Bash', file:'main.sh', mode:'shell',
    starter: "#!/bin/bash\necho \"Hello from Bash\"\nfor i in 1 2 3; do\n  echo \"line $i\"\ndone" },
];

let currentLang = LANGUAGES[0];
let cm;
let activeJobToken = 0;

const langSelect = document.getElementById('langSelect');
const fileChip = document.getElementById('fileChip');
const runBtn = document.getElementById('runBtn');
const stopBtn = document.getElementById('stopBtn');
const spinner = document.getElementById('spinner');
const runLabel = document.getElementById('runLabel');
const statusPill = document.getElementById('statusPill');
const consoleBody = document.getElementById('consoleBody');
const consoleMeta = document.getElementById('consoleMeta');
const stdinHead = document.getElementById('stdinHead');
const stdinBody = document.getElementById('stdinBody');
const stdinCaret = document.getElementById('stdinCaret');
const stdinBox = document.getElementById('stdinBox');
const resetBtn = document.getElementById('resetBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadInput = document.getElementById('uploadInput');
const downloadBtn = document.getElementById('downloadBtn');
const historyList = document.getElementById('historyList');
const statsSummary = document.getElementById('statsSummary');

function buildLangDropdown(){
  LANGUAGES.forEach(l=>{
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.label;
    langSelect.appendChild(opt);
  });
  langSelect.value = currentLang.id;
  langSelect.addEventListener('change', ()=> selectLanguage(langSelect.value));
}

function selectLanguage(id){
  const lang = LANGUAGES.find(l=>l.id===id);
  if(!lang) return;
  currentLang = lang;
  langSelect.value = lang.id;
  fileChip.textContent = lang.file;
  cm.setOption('mode', lang.mode);
  cm.setValue(lang.starter);
}

resetBtn.addEventListener('click', ()=> cm.setValue(currentLang.starter));

downloadBtn.addEventListener('click', ()=>{
  const blob = new Blob([cm.getValue()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = currentLang.file;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

const EXT_TO_LANG = { js:'javascript', ts:'typescript', py:'python', c:'c', h:'c', cpp:'cpp', cc:'cpp', java:'java', cs:'csharp', go:'go', rs:'rust', rb:'ruby', php:'php', sh:'bash' };

uploadBtn.addEventListener('click', ()=> uploadInput.click());
uploadInput.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const ext = file.name.split('.').pop().toLowerCase();
    const matchedId = EXT_TO_LANG[ext];
    if(matchedId && matchedId !== currentLang.id){
      const lang = LANGUAGES.find(l=>l.id===matchedId);
      if(lang){ currentLang = lang; langSelect.value = lang.id; cm.setOption('mode', lang.mode); }
    }
    fileChip.textContent = file.name;
    cm.setValue(ev.target.result);
  };
  reader.readAsText(file);
  uploadInput.value = '';
});

stdinHead.addEventListener('click', ()=>{
  const open = stdinBody.classList.toggle('open');
  stdinCaret.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
});

function initEditor(){
  cm = CodeMirror.fromTextArea(document.getElementById('codeArea'), {
    mode: currentLang.mode, theme: 'dracula', lineNumbers: true,
    indentUnit: 4, tabSize: 4, autofocus: true, viewportMargin: Infinity,
  });
  cm.setValue(currentLang.starter);
}

function setStatus(kind, label){
  statusPill.className = 'status-pill status-' + kind;
  statusPill.textContent = label;
}
function setRunning(isRunning){
  runBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;
  spinner.classList.toggle('on', isRunning);
  runLabel.textContent = isRunning ? 'Running…' : 'Run ▸';
}
function appendOutput(label, text, isErr){
  const l = document.createElement('span');
  l.className = 'out-label'; l.textContent = label;
  const p = document.createElement('pre');
  p.className = 'out-line' + (isErr ? ' out-stderr' : '');
  p.textContent = text && text.length ? text : '(empty)';
  consoleBody.appendChild(l); consoleBody.appendChild(p);
}

async function pollResult(token, jobToken){
  for(let attempt=0; attempt<25; attempt++){
    if(jobToken !== activeJobToken) return null;
    const res = await fetch(`/api/execute/${token}`);
    if(!res.ok){
      const errBody = await res.json().catch(()=>({}));
      throw new Error(errBody.error || `Poll failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    if(data.isDone) return data;
    await new Promise(r=>setTimeout(r, 900));
  }
  throw new Error('Timed out waiting for a result');
}

async function runCode(){
  const jobToken = ++activeJobToken;
  consoleBody.innerHTML = '';
  consoleMeta.textContent = '';
  setStatus('running','Running');
  setRunning(true);
  const started = performance.now();

  try{
    const createRes = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: currentLang.id, source: cm.getValue(), stdin: stdinBox.value }),
    });
    if(jobToken !== activeJobToken) return;
    const created = await createRes.json();
    if(!createRes.ok) throw new Error(created.error || `Submit failed (HTTP ${createRes.status})`);

    const data = await pollResult(created.token, jobToken);
    if(data === null) return;

    const elapsed = ((performance.now() - started)/1000).toFixed(2);
    consoleMeta.textContent = `${currentLang.label} · ${elapsed}s`;

    if(data.statusId === 6){
      appendOutput('Build errors', data.compileOutput || data.message || '', true);
      setStatus('error','Build failed');
    } else {
      if(data.compileOutput) appendOutput('Build', data.compileOutput, false);
      appendOutput('Run — stdout', data.stdout || '', false);
      if(data.stderr) appendOutput('Run — stderr', data.stderr, true);
      if(data.message && !data.stdout && !data.stderr) appendOutput('Message', data.message, !data.isSuccess);
      setStatus(data.isSuccess ? 'success' : 'error', data.isSuccess ? 'Success' : (data.statusLabel || 'Failed'));
    }

    loadHistory();
  }catch(e){
    if(jobToken !== activeJobToken) return;
    setStatus('error','Failed');
    appendOutput('Error', e.message || 'Something went wrong reaching the execution service.', true);
  }finally{
    if(jobToken === activeJobToken) setRunning(false);
  }
}

function stopCode(){
  activeJobToken++;
  setRunning(false);
  setStatus('idle','Stopped');
  appendOutput('Stopped', 'Execution cancelled locally (the remote job may finish shortly after).', false);
}

async function loadHistory(){
  try{
    const [historyRes, statsRes] = await Promise.all([
      fetch('/api/history?limit=8'), fetch('/api/stats'),
    ]);
    const history = await historyRes.json();
    const stats = await statsRes.json();

    statsSummary.textContent = stats.total_runs
      ? `${stats.total_runs} runs · ${Math.round(stats.success_rate*100)}% success`
      : '';

    historyList.innerHTML = '';
    history.forEach(run=>{
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `<span class="history-lang">${run.language}</span><span class="history-status ${run.status}">${run.status}</span>`;
      historyList.appendChild(row);
    });
  }catch(e){
    // history is a nice-to-have; don't let it break the editor if it fails
    console.warn('Could not load history', e);
  }
}

runBtn.addEventListener('click', runCode);
stopBtn.addEventListener('click', stopCode);
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    e.preventDefault();
    if(!runBtn.disabled) runCode();
  }
});

buildLangDropdown();
initEditor();
loadHistory();
