/* ── State ───────────────────────────────────────────────────────────────── */
const state = {
  courses: [],
  activeCourseId: null,
  allFiles: [],        // all files for current course
  visibleFiles: [],    // after format filter + search
  selectedIds: new Set(),
  enabledFormats: new Set(), // empty = all formats enabled
  availableFormats: [],
  searchQuery: ''
};

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const loginPanel      = $('login-panel');
const mainPanel       = $('main-panel');
const loginForm       = $('login-form');
const loginError      = $('login-error');
const loginBtn        = $('login-btn');
const logoutBtn       = $('logout-btn');
const userInfo        = $('user-info');
const userStatus      = $('user-status');
const coursesLoading  = $('courses-loading');
const coursesList     = $('courses-list');
const coursesEmpty    = $('courses-empty');
const refreshBtn      = $('refresh-courses-btn');
const selectCourseMsg = $('select-course-msg');
const fileBrowser     = $('file-browser');
const courseTitle     = $('course-title');
const fileCountEl     = $('file-count');
const searchInput     = $('search-input');
const formatFilterBtn = $('format-filter-btn');
const filterBadge     = $('filter-badge');
const formatPanel     = $('format-panel');
const formatCheckboxes= $('format-checkboxes');
const selectAllFormats= $('select-all-formats');
const selectNoFormats = $('select-no-formats');
const applyFilterBtn  = $('apply-filter-btn');
const closeFilterBtn  = $('close-filter-btn');
const selectAllFiles  = $('select-all-files');
const filteredInfo    = $('filtered-info');
const filesLoading    = $('files-loading');
const filesContainer  = $('files-container');
const filesEmpty      = $('files-empty');
const downloadBtn     = $('download-selected-btn');
const selectedCount   = $('selected-count');
const progressModal   = $('progress-modal');
const progressBar     = $('progress-bar');
const progressText    = $('progress-text');
const progressDone    = $('progress-done');
const closeModalBtn   = $('close-modal-btn');

/* ── Format definitions ──────────────────────────────────────────────────── */
const FORMAT_META = {
  pdf:  { label: 'PDF',        color: '#fca5a5', icon: 'PDF' },
  doc:  { label: 'Word',       color: '#93c5fd', icon: 'DOC' },
  docx: { label: 'Word',       color: '#93c5fd', icon: 'DOCX' },
  ppt:  { label: 'PowerPoint', color: '#fdba74', icon: 'PPT' },
  pptx: { label: 'PowerPoint', color: '#fdba74', icon: 'PPTX' },
  xls:  { label: 'Excel',      color: '#86efac', icon: 'XLS' },
  xlsx: { label: 'Excel',      color: '#86efac', icon: 'XLSX' },
  zip:  { label: 'ZIP',        color: '#fde047', icon: 'ZIP' },
  mp4:  { label: 'Video',      color: '#d8b4fe', icon: 'MP4' },
  mp3:  { label: 'Audio',      color: '#d8b4fe', icon: 'MP3' },
  txt:  { label: 'Text',       color: '#e2e8f0', icon: 'TXT' },
  png:  { label: 'Image',      color: '#67e8f9', icon: 'PNG' },
  jpg:  { label: 'Image',      color: '#67e8f9', icon: 'JPG' },
  gif:  { label: 'Image',      color: '#67e8f9', icon: 'GIF' },
  csv:  { label: 'CSV',        color: '#86efac', icon: 'CSV' },
};

function getExt(file) {
  if (!file.name) return 'bin';
  const parts = file.name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'bin';
}

function getIconClass(ext) {
  const map = { pdf:'icon-pdf', doc:'icon-doc', docx:'icon-docx', ppt:'icon-ppt', pptx:'icon-pptx', xls:'icon-xls', xlsx:'icon-xlsx', zip:'icon-zip', mp4:'icon-mp4', mp3:'icon-mp3', png:'icon-img', jpg:'icon-img', gif:'icon-img' };
  return map[ext] || 'icon-default';
}

/* ── Utils ───────────────────────────────────────────────────────────────── */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setLoading(btn, loading) {
  const text = btn.querySelector('.btn-text') || btn;
  const spin = btn.querySelector('.spinner');
  if (loading) { btn.disabled = true; if (spin) show(spin); if (text !== btn) text.textContent = 'Loading...'; }
  else { btn.disabled = false; if (spin) hide(spin); }
}
function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}
function showError(el, msg) { el.textContent = msg; show(el); }
function hideError(el) { hide(el); }

/* ── Login ───────────────────────────────────────────────────────────────── */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideError(loginError);
  const bbUrl    = $('bb-url').value.trim();
  const username = $('username').value.trim();
  const password = $('password').value;
  const btnText  = loginBtn.querySelector('.btn-text');
  const spinner  = loginBtn.querySelector('.spinner');

  loginBtn.disabled = true;
  btnText.textContent = 'Connecting...';
  show(spinner);

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbUrl, username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    // Switch to main view
    hide(loginPanel);
    show(mainPanel);
    userStatus.textContent = `${username} @ ${new URL(bbUrl.startsWith('http') ? bbUrl : 'https://' + bbUrl).hostname}`;
    show(userInfo);
    loadCourses();
  } catch (err) {
    showError(loginError, err.message);
  } finally {
    loginBtn.disabled = false;
    btnText.textContent = 'Connect to Blackboard';
    hide(spinner);
  }
});

/* ── Logout ──────────────────────────────────────────────────────────────── */
logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  hide(mainPanel);
  hide(userInfo);
  show(loginPanel);
  coursesList.innerHTML = '';
  state.courses = [];
  state.activeCourseId = null;
  resetFileBrowser();
});

/* ── Load Courses ────────────────────────────────────────────────────────── */
async function loadCourses() {
  show(coursesLoading);
  hide(coursesList);
  hide(coursesEmpty);

  try {
    const res  = await fetch('/api/courses');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load courses');
    state.courses = data.courses || [];
    renderCourses();
  } catch (err) {
    state.courses = [];
    renderCourses();
    console.error(err);
  } finally {
    hide(coursesLoading);
  }
}

function renderCourses() {
  coursesList.innerHTML = '';
  if (!state.courses.length) {
    show(coursesEmpty);
    return;
  }
  show(coursesList);
  state.courses.forEach(course => {
    const li = document.createElement('li');
    li.className = 'course-item';
    li.dataset.id = course.id;
    li.innerHTML = `
      <svg class="course-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <div>
        <div class="course-name">${escHtml(course.name)}</div>
        <div class="course-id">${escHtml(course.courseId || course.id)}</div>
      </div>`;
    li.addEventListener('click', () => selectCourse(course));
    coursesList.appendChild(li);
  });
}

refreshBtn.addEventListener('click', loadCourses);

/* ── Select Course ───────────────────────────────────────────────────────── */
async function selectCourse(course) {
  // Update sidebar active state
  document.querySelectorAll('.course-item').forEach(el => el.classList.remove('active'));
  const activeEl = coursesList.querySelector(`[data-id="${CSS.escape(course.id)}"]`);
  if (activeEl) activeEl.classList.add('active');

  state.activeCourseId = course.id;
  resetFileBrowser();
  hide(selectCourseMsg);
  show(fileBrowser);
  courseTitle.textContent = course.name;

  show(filesLoading);
  hide(filesContainer);
  hide(filesEmpty);

  try {
    const res  = await fetch(`/api/courses/${encodeURIComponent(course.id)}/contents`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load files');
    state.allFiles = data.files || [];
    buildFormatList();
    applyFilters();
  } catch (err) {
    state.allFiles = [];
    hide(filesLoading);
    show(filesEmpty);
    console.error(err);
  }
}

/* ── Format Filter ───────────────────────────────────────────────────────── */
function buildFormatList() {
  const extSet = new Set(state.allFiles.map(f => getExt(f)));
  state.availableFormats = Array.from(extSet).sort();
  // Reset enabled formats to "all"
  state.enabledFormats = new Set();

  formatCheckboxes.innerHTML = '';
  state.availableFormats.forEach(ext => {
    const meta = FORMAT_META[ext] || { label: ext.toUpperCase(), icon: ext.toUpperCase() };
    const chip = document.createElement('label');
    chip.className = 'format-chip';
    chip.innerHTML = `<input type="checkbox" value="${ext}" checked /><span style="color:${meta.color||'#94a3b8'}">${meta.icon}</span>${meta.label}`;
    formatCheckboxes.appendChild(chip);
  });
}

formatFilterBtn.addEventListener('click', () => {
  formatPanel.classList.toggle('hidden');
});
closeFilterBtn.addEventListener('click', () => hide(formatPanel));

selectAllFormats.addEventListener('click', () => {
  formatCheckboxes.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
});
selectNoFormats.addEventListener('click', () => {
  formatCheckboxes.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
});

applyFilterBtn.addEventListener('click', () => {
  const checked = Array.from(formatCheckboxes.querySelectorAll('input:checked')).map(cb => cb.value);
  // If all formats checked → empty set means "all enabled"
  if (checked.length === state.availableFormats.length) {
    state.enabledFormats = new Set();
  } else {
    state.enabledFormats = new Set(checked);
  }
  // Update badge
  if (state.enabledFormats.size > 0) {
    filterBadge.textContent = state.enabledFormats.size;
    show(filterBadge);
  } else {
    hide(filterBadge);
  }
  hide(formatPanel);
  applyFilters();
});

/* ── Search ──────────────────────────────────────────────────────────────── */
searchInput.addEventListener('input', () => {
  state.searchQuery = searchInput.value.toLowerCase();
  applyFilters();
});

/* ── Apply Filters ───────────────────────────────────────────────────────── */
function applyFilters() {
  let files = state.allFiles;

  if (state.enabledFormats.size > 0) {
    files = files.filter(f => state.enabledFormats.has(getExt(f)));
  }
  if (state.searchQuery) {
    files = files.filter(f =>
      (f.name || '').toLowerCase().includes(state.searchQuery) ||
      (f.title || '').toLowerCase().includes(state.searchQuery) ||
      (f.folder || '').toLowerCase().includes(state.searchQuery)
    );
  }

  state.visibleFiles = files;
  state.selectedIds.clear();
  renderFiles();
  updateSelectionUI();
}

/* ── Render Files ────────────────────────────────────────────────────────── */
function renderFiles() {
  hide(filesLoading);
  filesContainer.innerHTML = '';

  if (!state.visibleFiles.length) {
    show(filesEmpty);
    hide(filesContainer);
    fileCountEl.textContent = '0 files';
    return;
  }

  hide(filesEmpty);
  show(filesContainer);

  const total = state.allFiles.length;
  const shown = state.visibleFiles.length;
  fileCountEl.textContent = `${shown} file${shown !== 1 ? 's' : ''}`;
  if (shown < total) {
    filteredInfo.textContent = `Showing ${shown} of ${total}`;
    show(filteredInfo);
  } else {
    filteredInfo.textContent = '';
    hide(filteredInfo);
  }

  // Group by folder
  const groups = {};
  state.visibleFiles.forEach(f => {
    const folder = f.folder || 'General';
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(f);
  });

  Object.entries(groups).forEach(([folder, files]) => {
    const group = document.createElement('div');
    group.className = 'folder-group';
    group.innerHTML = `<div class="folder-name">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      ${escHtml(folder)} <span style="color:#475569;font-weight:400">(${files.length})</span>
    </div>`;

    files.forEach(file => {
      const ext = getExt(file);
      const iconClass = getIconClass(ext);
      const meta = FORMAT_META[ext] || {};
      const row = document.createElement('div');
      row.className = 'file-row';
      row.dataset.id = file.id;
      row.innerHTML = `
        <input class="file-checkbox" type="checkbox" data-id="${escAttr(file.id)}" />
        <div class="file-icon ${iconClass}">${(meta.icon || ext.toUpperCase()).substring(0,4)}</div>
        <div class="file-info">
          <div class="file-name" title="${escAttr(file.name)}">${escHtml(file.name || file.title || 'Unnamed file')}</div>
          <div class="file-meta">${ext.toUpperCase()}${file.size ? ' · ' + formatBytes(file.size) : ''}</div>
        </div>
        <div class="file-actions">
          <button class="file-dl-btn" data-url="${escAttr(file.downloadUrl)}" data-name="${escAttr(file.name)}" title="Download this file">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
        </div>`;

      const cb = row.querySelector('.file-checkbox');
      cb.addEventListener('change', () => toggleFile(file.id, cb.checked, row));
      row.querySelector('.file-dl-btn').addEventListener('click', e => {
        e.stopPropagation();
        downloadSingle(file);
      });
      row.addEventListener('click', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        cb.checked = !cb.checked;
        toggleFile(file.id, cb.checked, row);
      });

      group.appendChild(row);
    });

    filesContainer.appendChild(group);
  });
}

/* ── Selection ───────────────────────────────────────────────────────────── */
function toggleFile(id, checked, row) {
  if (checked) { state.selectedIds.add(id); row.classList.add('selected'); }
  else { state.selectedIds.delete(id); row.classList.remove('selected'); }
  updateSelectionUI();
}

selectAllFiles.addEventListener('change', () => {
  const checked = selectAllFiles.checked;
  state.selectedIds.clear();
  document.querySelectorAll('.file-checkbox').forEach(cb => {
    cb.checked = checked;
    const row = cb.closest('.file-row');
    if (checked) { state.selectedIds.add(cb.dataset.id); row.classList.add('selected'); }
    else { row.classList.remove('selected'); }
  });
  updateSelectionUI();
});

function updateSelectionUI() {
  const n = state.selectedIds.size;
  selectedCount.textContent = n;
  downloadBtn.disabled = n === 0;
  selectAllFiles.indeterminate = n > 0 && n < state.visibleFiles.length;
  selectAllFiles.checked = n > 0 && n === state.visibleFiles.length;
}

/* ── Download Single ─────────────────────────────────────────────────────── */
function downloadSingle(file) {
  const a = document.createElement('a');
  a.href = `/api/download/file?url=${encodeURIComponent(file.downloadUrl)}&filename=${encodeURIComponent(file.name || 'file')}`;
  a.download = file.name || 'file';
  a.click();
}

/* ── Download ZIP ────────────────────────────────────────────────────────── */
downloadBtn.addEventListener('click', async () => {
  const selectedFiles = state.visibleFiles.filter(f => state.selectedIds.has(f.id));
  if (!selectedFiles.length) return;

  // Show format selection modal before downloading
  const formats = state.enabledFormats.size > 0 ? Array.from(state.enabledFormats) : [];

  show(progressModal);
  hide(progressDone);
  progressBar.style.width = '0%';
  progressText.textContent = `Preparing ${selectedFiles.length} file(s)...`;

  // Animate progress bar
  let fakeProgress = 0;
  const interval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 3, 85);
    progressBar.style.width = fakeProgress + '%';
  }, 200);

  try {
    const courseName = courseTitle.textContent || 'blackboard';
    const res = await fetch('/api/download/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: selectedFiles,
        formats,
        zipName: courseName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Download failed');
    }

    clearInterval(interval);
    progressBar.style.width = '100%';
    progressText.textContent = 'Creating ZIP file...';

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${courseName.replace(/[^a-z0-9]/gi, '_')}_files.zip`;
    a.click();
    URL.revokeObjectURL(url);

    show(progressDone);
    progressText.textContent = `Downloaded ${selectedFiles.length} file(s)`;
  } catch (err) {
    clearInterval(interval);
    progressText.textContent = 'Error: ' + err.message;
    progressBar.style.background = '#ef4444';
  }
});

closeModalBtn.addEventListener('click', () => hide(progressModal));

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function resetFileBrowser() {
  state.allFiles = [];
  state.visibleFiles = [];
  state.selectedIds.clear();
  state.enabledFormats = new Set();
  state.availableFormats = [];
  state.searchQuery = '';
  searchInput.value = '';
  filesContainer.innerHTML = '';
  hide(filterBadge);
  hide(formatPanel);
  updateSelectionUI();
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
