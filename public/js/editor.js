// Question set editor. Sets live in this browser (localStorage); the host page
// sends the chosen set to the server when a room is created or the set is changed.
const MAX_SETS = 30;
const MAX_QUESTIONS = 50;
const LETTERS = ['A', 'B', 'C', 'D'];

let store = loadSetStore();
let activeId = store.sets.length ? store.sets[0].id : null;
let saveTimer = null;
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const activeSet = () => store.sets.find(s => s.id === activeId) || null;

function el(tag, props, children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (children || []).forEach(c => c && node.appendChild(c));
  return node;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function newQuestion() {
  return { id: uid(), text: '', options: ['', '', '', ''], answer: 0 };
}

// ---- saving ----
function persist() {
  const ok = saveSetStore(store);
  const state = $('save-state');
  if (state) {
    state.textContent = ok ? 'Đã lưu' : 'Không lưu được: trình duyệt đang chặn lưu trữ. Hãy xuất file JSON để giữ lại.';
    state.className = 'save-state' + (ok ? '' : ' error');
  }
}
function persistSoon() {
  const state = $('save-state');
  if (state) { state.textContent = 'Đang lưu...'; state.className = 'save-state'; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
}

// ---- sidebar ----
function renderSide() {
  const list = $('set-list');
  list.innerHTML = '';
  if (!store.sets.length) {
    list.appendChild(el('li', { class: 'empty-note', text: 'Chưa có bộ nào.' }));
  }
  store.sets.forEach(s => {
    const ready = setIsReady(s);
    const btn = el('button', {
      class: 'set-item' + (s.id === activeId ? ' active' : ''), type: 'button',
      onclick: () => { activeId = s.id; renderAll(); }
    }, [
      el('span', { text: s.name || 'Bộ chưa đặt tên' }),
      el('small', { class: ready ? '' : 'bad-flag', text: ready ? `${s.questions.length} câu` : 'chưa xong' })
    ]);
    list.appendChild(el('li', {}, [btn]));
  });
}

// ---- main panel ----
function renderMain() {
  const main = $('main-ed');
  main.innerHTML = '';
  const set = activeSet();

  if (!set) {
    main.appendChild(el('div', { class: 'empty-state' }, [
      el('h2', { class: 'display', text: 'Chưa có bộ câu hỏi nào' }),
      el('p', { text: 'Tạo bộ mới, sao chép bộ mặc định để sửa, hoặc nhập từ file JSON.', style: 'margin: 8px 0 18px;' }),
      el('button', { class: 'btn-primary', type: 'button', onclick: createSet, text: 'Tạo bộ mới' })
    ]));
    return;
  }

  // name + save state
  const nameInput = el('input', { type: 'text', maxlength: '60', value: set.name, placeholder: 'Tên bộ câu hỏi', 'aria-label': 'Tên bộ câu hỏi' });
  nameInput.addEventListener('input', () => { set.name = nameInput.value; persistSoon(); renderSide(); refreshHeaderState(); });
  main.appendChild(el('div', { class: 'name-row' }, [nameInput, el('span', { class: 'save-state', id: 'save-state', text: '' })]));

  // actions
  const useBtn = el('button', { class: 'btn-ghost btn-small', type: 'button', id: 'btn-use', onclick: () => {
    if (!setIsReady(set)) return toast('Hãy hoàn thành mọi câu hỏi trước khi dùng bộ này.');
    store.selected = set.id; persist(); refreshHeaderState();
    toast('Đã chọn bộ này. Host sẽ dùng nó khi tạo phòng.');
  } , text: 'Dùng cho phòng của host' });
  const actions = el('div', { class: 'name-row' }, [
    el('button', { class: 'btn-primary btn-small', type: 'button', onclick: addQuestion, text: 'Thêm câu hỏi' }),
    useBtn,
    el('button', { class: 'btn-ghost btn-small', type: 'button', onclick: exportSet, text: 'Xuất JSON' }),
    el('button', { class: 'btn-danger btn-small', type: 'button', onclick: deleteSet, text: 'Xóa bộ này' })
  ]);
  main.appendChild(actions);
  main.appendChild(el('p', { class: 'summary', id: 'summary' }));

  if (!set.questions.length) {
    main.appendChild(el('div', { class: 'empty-state', text: 'Bộ này chưa có câu hỏi. Bấm "Thêm câu hỏi" để bắt đầu.' }));
  }
  set.questions.forEach((q, i) => main.appendChild(renderQuestion(set, q, i)));
  refreshHeaderState();
}

function refreshHeaderState() {
  const set = activeSet();
  if (!set) return;
  const bad = set.questions.filter(q => questionProblems(q).length).length;
  const sum = $('summary');
  if (sum) {
    sum.innerHTML = '';
    sum.appendChild(document.createTextNode(`${set.questions.length}/${MAX_QUESTIONS} câu. `));
    if (!set.questions.length) sum.appendChild(document.createTextNode('Cần ít nhất 1 câu để dùng bộ này.'));
    else if (bad) sum.appendChild(el('b', { class: 'bad', text: `${bad} câu chưa hoàn chỉnh, chưa thể dùng bộ này.` }));
    else sum.appendChild(document.createTextNode('Mọi câu đã hoàn chỉnh.'));
  }
  const use = $('btn-use');
  if (use) {
    const chosen = store.selected === set.id;
    use.textContent = chosen ? 'Đang dùng cho phòng của host' : 'Dùng cho phòng của host';
    use.disabled = chosen;
  }
}

function renderQuestion(set, q, index) {
  const card = el('section', { class: 'q-edit' });
  const problems = el('div', { class: 'problems' });
  const refreshCard = () => {
    const p = questionProblems(q);
    card.classList.toggle('invalid', p.length > 0);
    problems.textContent = p.join('. ');
    refreshHeaderState();
    renderSide();
  };

  const move = (delta) => () => {
    const j = index + delta;
    if (j < 0 || j >= set.questions.length) return;
    [set.questions[index], set.questions[j]] = [set.questions[j], set.questions[index]];
    persistSoon(); renderMain();
  };
  card.appendChild(el('div', { class: 'q-edit-head' }, [
    el('span', { class: 'num', text: `Câu ${index + 1}` }),
    el('button', { class: 'btn-ghost btn-small', type: 'button', 'aria-label': 'Chuyển câu lên', onclick: move(-1), text: '↑' }),
    el('button', { class: 'btn-ghost btn-small', type: 'button', 'aria-label': 'Chuyển câu xuống', onclick: move(1), text: '↓' }),
    el('button', { class: 'btn-ghost btn-small', type: 'button', text: 'Nhân đôi', onclick: () => {
      if (set.questions.length >= MAX_QUESTIONS) return toast(`Tối đa ${MAX_QUESTIONS} câu mỗi bộ.`);
      set.questions.splice(index + 1, 0, { id: uid(), text: q.text, options: [...q.options], answer: q.answer });
      persistSoon(); renderMain();
    } }),
    el('button', { class: 'btn-danger btn-small', type: 'button', text: 'Xóa câu', onclick: () => {
      const hasContent = q.text.trim() || q.options.some(o => o.trim());
      if (hasContent && !confirm(`Xóa câu ${index + 1}?`)) return;
      set.questions.splice(index, 1);
      persistSoon(); renderMain();
    } })
  ]));

  const text = el('textarea', { maxlength: '200', placeholder: 'Nội dung câu hỏi', 'aria-label': `Nội dung câu ${index + 1}` });
  text.value = q.text;
  text.addEventListener('input', () => { q.text = text.value; persistSoon(); refreshCard(); });
  card.appendChild(text);

  q.options.forEach((opt, k) => {
    const input = el('input', { type: 'text', maxlength: '100', placeholder: `Đáp án ${LETTERS[k]}`, 'aria-label': `Đáp án ${LETTERS[k]} của câu ${index + 1}` });
    input.value = opt;
    input.addEventListener('input', () => { q.options[k] = input.value; persistSoon(); refreshCard(); });
    const radio = el('input', { type: 'radio', name: `ans-${q.id}`, 'aria-label': `Đáp án ${LETTERS[k]} là đáp án đúng` });
    radio.checked = q.answer === k;
    const pick = el('label', { class: 'correct-pick' + (q.answer === k ? ' is-correct' : '') }, [radio, el('span', { text: 'Đáp án đúng' })]);
    radio.addEventListener('change', () => {
      q.answer = k;
      card.querySelectorAll('.correct-pick').forEach((lab, idx) => lab.classList.toggle('is-correct', idx === k));
      persistSoon(); refreshCard();
    });
    card.appendChild(el('div', { class: 'opt-row' }, [el('span', { class: 'tag tag-' + k, text: LETTERS[k] }), input, pick]));
  });

  card.appendChild(problems);
  const p = questionProblems(q);
  card.classList.toggle('invalid', p.length > 0 && (q.text || q.options.some(o => o)));
  // A brand-new empty card is not flagged until the host starts typing.
  problems.textContent = (q.text || q.options.some(o => o)) ? p.join('. ') : '';
  return card;
}

// ---- actions ----
function createSet() {
  if (store.sets.length >= MAX_SETS) return toast(`Tối đa ${MAX_SETS} bộ câu hỏi.`);
  const set = { id: uid(), name: 'Bộ câu hỏi mới', questions: [newQuestion()] };
  store.sets.push(set);
  activeId = set.id;
  persist(); renderAll();
  const input = document.querySelector('.name-row input');
  if (input) { input.focus(); input.select(); }
}

function addQuestion() {
  const set = activeSet();
  if (!set) return;
  if (set.questions.length >= MAX_QUESTIONS) return toast(`Tối đa ${MAX_QUESTIONS} câu mỗi bộ.`);
  set.questions.push(newQuestion());
  persistSoon(); renderMain();
  const areas = document.querySelectorAll('.q-edit textarea');
  const last = areas[areas.length - 1];
  if (last) { last.focus(); last.scrollIntoView({ block: 'center' }); }
}

function deleteSet() {
  const set = activeSet();
  if (!set) return;
  if (!confirm(`Xóa bộ "${set.name || 'chưa đặt tên'}" cùng ${set.questions.length} câu hỏi?`)) return;
  store.sets = store.sets.filter(s => s.id !== set.id);
  if (store.selected === set.id) store.selected = DEFAULT_SET_ID;
  activeId = store.sets.length ? store.sets[0].id : null;
  persist(); renderAll();
}

function exportSet() {
  const set = activeSet();
  if (!set) return;
  // Same shape as data/questions.json, so the file can be re-imported or used on the server.
  const data = set.questions.map(q => ({ text: q.text.trim(), options: q.options.map(o => o.trim()), answer: q.answer }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // Plain ASCII file name (no diacritics), so every browser and OS accepts it.
  const base = (set.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  a.download = (base || 'bo-cau-hoi') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importQuestions(raw, fallbackName) {
  let name = fallbackName;
  let list = raw;
  if (raw && !Array.isArray(raw) && Array.isArray(raw.questions)) { list = raw.questions; if (typeof raw.name === 'string' && raw.name.trim()) name = raw.name.trim(); }
  if (!Array.isArray(list)) return toast('File không đúng định dạng: cần một danh sách câu hỏi.');
  const good = [];
  let skipped = 0;
  list.forEach(item => {
    const q = item && typeof item === 'object' ? {
      id: uid(),
      text: typeof item.text === 'string' ? item.text : '',
      options: Array.isArray(item.options) ? item.options.slice(0, 4).map(o => (typeof o === 'string' ? o : String(o ?? ''))) : [],
      answer: item.answer
    } : null;
    while (q && q.options.length < 4) q.options.push('');
    if (q && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3 && q.text.trim()) good.push(q); else skipped++;
  });
  if (!good.length) return toast('Không tìm thấy câu hỏi hợp lệ trong file (cần text, 4 options và answer từ 0 đến 3).');
  if (store.sets.length >= MAX_SETS) return toast(`Tối đa ${MAX_SETS} bộ câu hỏi.`);
  const trimmed = good.slice(0, MAX_QUESTIONS);
  const set = { id: uid(), name: (name || 'Bộ nhập từ file').slice(0, 60), questions: trimmed };
  store.sets.push(set); activeId = set.id;
  persist(); renderAll();
  const notes = [];
  if (skipped) notes.push(`bỏ qua ${skipped} câu không hợp lệ`);
  if (good.length > MAX_QUESTIONS) notes.push(`chỉ lấy ${MAX_QUESTIONS} câu đầu`);
  toast(`Đã nhập ${trimmed.length} câu${notes.length ? ' (' + notes.join(', ') + ')' : ''}.`);
}

$('btn-new-set').addEventListener('click', createSet);
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) return toast('File quá lớn (tối đa 1 MB).');
  try {
    importQuestions(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ''));
  } catch (err) {
    toast('Không đọc được file: đây không phải JSON hợp lệ.');
  }
});
$('btn-copy-default').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/default-questions');
    const data = await res.json();
    importQuestions(data.questions, 'Bản sao: ' + (data.name || 'bộ mặc định'));
  } catch (err) {
    toast('Không tải được bộ mặc định. Kiểm tra kết nối rồi thử lại.');
  }
});

function renderAll() { renderSide(); renderMain(); }
renderAll();
